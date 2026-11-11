/**
 * #region moduleContract
 * @purpose Give a human a local console without the harness.
 * @scope Loopback HTTP, static assets, profile reads, note actions, proposals, and compaction answers.
 * @invariants The command `ui` starts the console with no harness.
 * @invariants Bind only to 127.0.0.1. Reject foreign hosts and origins. Never enable CORS.
 * @invariants Writes require JSON. Delete requires --allow-delete and explicit confirmation.
 * @invariants An amend takes a destination scope, a kind, and supersede targets of that scope.
 * @invariants Each request opens its selected profile and closes its store, including on failure.
 * @invariants A view combines its projection, proposals, and revision without an intervening write.
 * @invariants Proposal approval uses ordinary write rules and publishes its dismiss event under the same store lock.
 * @invariants Compaction supports scope and catalog trees. Answers retain copied inputs. The store rejects changed inputs before publication.
 * @invariants Log request paths, result codes, and operation counts, without note content.
 * #endregion moduleContract
 */

import { once } from "node:events";
import { readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { debuglog } from "node:util";
import {
	addDays,
	type BuildInput,
	catalogKey,
	catalogTree,
	type Event,
	filterHits,
	isCatalogKey,
	MemlensError,
	type NoteKind,
	normalizeScopeKey,
	nowIso,
	openNote,
	openRange,
	type Projection,
	parseAddress,
	readConsole,
	type ScopeKey,
	scopeTree,
	toIsoDate,
	validateScopeKey,
} from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import { type CommandIo, countFlag, flagValue } from "./commands.js";
import { applyAnswers, parseAnswers, prepareCompact } from "./compact.js";
import {
	cliActiveScope,
	openRuntime,
	profileLists,
	type Runtime,
	runtimeVisibleScopes,
} from "./runtime.js";

const debug = debuglog("memlens:ui");
const KINDS = ["decision", "preference", "fact", "task", "note"] as const;
type Fields = Record<string, unknown>;

// #region FUNC_startUi
/**
 * @purpose Start a standalone console and return its address and shutdown operation.
 * @invariants Port zero selects a free port for tests. The CLI uses port 7788 by default.
 */
export async function startUi(options: {
	storeFlag: string | null;
	env?: Record<string, string | undefined>;
	cwd?: string;
	port?: number;
	allowDelete?: boolean;
}) {
	const port = options.port ?? 7788;
	if (!Number.isInteger(port) || port < 0 || port > 65535)
		throw new MemlensError("Usage", "The port must be between 0 and 65535.");
	const server = createServer((request, response) => {
		void route(request, response, options).catch((error: unknown) => {
			const status =
				error instanceof MemlensError
					? error.code === "NotAllowed"
						? 403
						: error.code === "Usage"
							? 400
							: 422
					: 500;
			debug("Request failed", {
				event: "error",
				status,
				code: error instanceof MemlensError ? error.code : "Internal",
			});
			send(response, status, {
				error: error instanceof Error ? error.message : "The request failed.",
			});
		});
	});
	server.requestTimeout = 15_000;
	server.headersTimeout = 10_000;
	server.listen(port, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("The server has no port.");
	const url = `http://127.0.0.1:${address.port}`;
	debug("Console started", {
		event: "listen",
		port: address.port,
		allowDelete: options.allowDelete === true,
	});
	return {
		url,
		close: async () => {
			server.closeIdleConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			debug("Console stopped", { event: "close" });
		},
	};
}
// #endregion FUNC_startUi

// #region FUNC_uiCommand
/** @purpose Start the console from the CLI with a validated port and delete policy. */
export async function uiCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const port = countFlag(args.flags, "port", 7788);
	if (port < 1 || port > 65535)
		throw new MemlensError("Usage", "The port must be between 1 and 65535.");
	const host = await startUi({
		storeFlag: flagValue(args.flags, "store"),
		env: io.env,
		cwd: io.cwd,
		port,
		allowDelete: args.flags["allow-delete"] === true,
	});
	const stop = () => {
		void host.close();
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	return host.url;
}
// #endregion FUNC_uiCommand

// #region FUNC_route
/** @purpose Resolve one local request into a console read or a validated human action. */
async function route(
	request: IncomingMessage,
	response: ServerResponse,
	options: Parameters<typeof startUi>[0],
): Promise<void> {
	const port = request.socket.localPort;
	const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
	const host = request.headers.host ?? "";
	if (
		!hosts.includes(host) ||
		(request.headers.origin !== undefined &&
			request.headers.origin !== `http://${host}`)
	)
		throw new MemlensError(
			"NotAllowed",
			"The request must come from this console.",
		);
	const url = new URL(request.url ?? "/", `http://${host}`);
	debug("Request start", {
		event: "request",
		method: request.method,
		path: url.pathname,
	});
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("X-Content-Type-Options", "nosniff");
	response.setHeader(
		"Content-Security-Policy",
		"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
	);
	const assets: Record<string, [string, string]> = {
		"/": ["index.html", "text/html; charset=utf-8"],
		"/client.js": ["client.js", "text/javascript; charset=utf-8"],
		"/style.css": ["style.css", "text/css; charset=utf-8"],
	};
	const asset = assets[url.pathname];
	if (asset && request.method === "GET") {
		const data = await readFile(new URL(`./ui/${asset[0]}`, import.meta.url));
		response.writeHead(200, { "Content-Type": asset[1] });
		response.end(data);
		return;
	}
	if (!url.pathname.startsWith("/api/")) {
		send(response, 404, { error: "No such route." });
		return;
	}
	if (
		url.pathname === "/api/action"
			? request.method !== "POST"
			: request.method !== "GET"
	) {
		send(response, 405, { error: "The method is not allowed." });
		return;
	}
	const fields =
		request.method === "POST"
			? await readBody(request)
			: Object.fromEntries(url.searchParams);
	const runtime = await openRuntime({
		storeFlag: options.storeFlag,
		profile: text(fields, "profile") || null,
		env: options.env ?? process.env,
	});
	try {
		const requested = text(fields, "scope");
		const visible = runtimeVisibleScopes(runtime);
		const fallback = cliActiveScope(runtime.base, options.cwd ?? process.cwd());
		const first =
			visible[0] ??
			runtime.config.profile.scopes.find(validateScopeKey) ??
			fallback;
		const scope = allowedScope(
			runtime,
			requested || (matches(runtime, fallback) ? fallback : first),
		);
		let result: unknown;
		switch (url.pathname) {
			case "/api/view": {
				for (;;) {
					const view = await readConsole(runtime.store, runtime.config, scope);
					const proposals = await pendingProposals(runtime);
					if (view.revision !== (await runtime.store.rev())) {
						debug("View retry", { event: "retry", scope });
						continue;
					}
					result = {
						...view,
						proposals,
						profiles: Object.keys(runtime.base.profile),
						path: runtime.path,
						backend: runtime.config.store.backend,
						allowDelete: options.allowDelete === true,
						reviewPolicy: runtime.config.review,
					};
					break;
				}
				break;
			}
			case "/api/search": {
				const limit = text(fields, "limit") || "10";
				if (!/^\d+$/.test(limit) || Number(limit) > 1000)
					throw new MemlensError(
						"Usage",
						"The limit must be between 0 and 1000.",
					);
				const scopes = requested ? [scope] : visible;
				const hits = (
					await Promise.all(
						scopes.map((key) =>
							runtime.store.search(text(fields, "query"), key, 50),
						),
					)
				).flat();
				const kind = text(fields, "kind");
				result = filterHits(
					hits,
					{
						scopes,
						limit: Number(limit),
						since: text(fields, "since"),
						...(kind ? { kinds: [noteKind(kind)] } : {}),
					},
					toIsoDate(Date.now()),
				);
				break;
			}
			case "/api/open": {
				const address = parseAddress(text(fields, "target"));
				if (!address)
					throw new MemlensError("Usage", "The target must be an address.");
				const key = allowedScope(runtime, address.scope ?? scope);
				if (address.kind === "range" || address.kind === "scoped-range")
					result = openRange(
						key,
						scopeTree(runtime.projection, key),
						address.start,
						address.end,
					);
				else {
					const record = (runtime.projection.byScope.get(key) ?? []).find(
						(record) => record.pos === address.pos,
					);
					if (!record)
						throw new MemlensError("Data", "The note does not exist.");
					result = openNote(key, record, "all");
				}
				break;
			}
			case "/api/action":
				result = await applyAction(
					runtime,
					scope,
					fields,
					options.allowDelete === true,
				);
				break;
			default:
				send(response, 404, { error: "No such route." });
				return;
		}
		send(response, 200, result);
		debug("Request done", {
			event: "response",
			path: url.pathname,
			status: 200,
		});
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_route

// #region FUNC_applyAction
/** @purpose Apply a human edit through the existing store validation and publication boundary. */
async function applyAction(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
	allowDelete: boolean,
): Promise<unknown> {
	const action = text(fields, "action");
	debug("Action start", { event: "action", action, scope });
	if (action === "compact" || action === "compact-answer")
		return compact(runtime, scope, fields);
	if (action === "delete" || action === "scope-delete") {
		if (!allowDelete || fields.confirm !== true)
			throw new MemlensError(
				"NotAllowed",
				"Delete needs --allow-delete and confirmation.",
			);
	}
	if (action === "note") {
		const kind = noteKind(text(fields, "kind") || "note");
		const supersedes = text(fields, "supersedes")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
			.map((target) => targetRecord(runtime, scope, target).id);
		const event = await runtime.store.append({
			op: "note",
			scope,
			body: text(fields, "body"),
			kind,
			longform: text(fields, "longform"),
			...(supersedes.length ? { supersedes } : {}),
			ts: nowIso(),
			review_at: addDays(Date.now(), runtime.config.review[kind]),
			session: "ui",
			turn: "ui",
			preset: "ui",
		});
		return { id: event.id };
	}
	if (action === "accept" || action === "dismiss") {
		const proposal = (await pendingProposals(runtime)).find(
			(event) => event.id === text(fields, "target"),
		);
		if (!proposal)
			throw new MemlensError("Data", "The proposal is no longer pending.");
		await runtime.store.decideProposal(proposal, action === "accept", [
			...runtimeVisibleScopes(runtime),
			proposal.scope,
		]);
		debug("Proposal closed", { event: "proposal", action, id: proposal.id });
		return { ok: true };
	}
	if (action === "scope-forget" || action === "scope-delete") {
		if (fields.confirm !== true)
			throw new MemlensError(
				"NotAllowed",
				"The scope action needs confirmation.",
			);
		const records = (runtime.projection.byScope.get(scope) ?? []).filter(
			(record) =>
				action === "scope-delete"
					? !record.content_cleared
					: record.state === "live",
		);
		for (const record of records)
			await runtime.store.append({
				op: action === "scope-delete" ? "redact" : "hide",
				scope,
				target: record.id,
				reason: "ui scope action",
			});
		return { changed: records.length };
	}
	const record = targetRecord(runtime, scope, text(fields, "target"));
	let event: Event;
	switch (action) {
		case "amend": {
			const destination = text(fields, "dest") || record.scope;
			const scope = allowedScope(runtime, destination);
			const kind = text(fields, "kind");
			const supersedes = text(fields, "supersedes")
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
				.map((target) => targetRecord(runtime, scope, target).id);
			event = await runtime.store.append({
				op: "amend",
				scope,
				target: record.id,
				body: text(fields, "body"),
				longform: text(fields, "longform"),
				...(kind ? { kind: noteKind(kind) } : {}),
				...(supersedes.length ? { supersedes } : {}),
			});
			break;
		}
		case "review":
			event = await runtime.store.append({
				op: "review",
				scope: record.scope,
				target: record.id,
				review_at: addDays(Date.now(), runtime.config.review[record.kind]),
			});
			break;
		case "forget":
		case "delete":
			event = await runtime.store.append({
				op: action === "delete" ? "redact" : "hide",
				scope: record.scope,
				target: record.id,
				reason: "ui action",
			});
			break;
		default:
			throw new MemlensError("Usage", "The action is unknown.");
	}
	debug("Action done", { event: "applied", action, id: event.id });
	return { ok: true };
}
// #endregion FUNC_applyAction

// #region FUNC_compact
/**
 * @purpose Give the merge inputs of one tree and publish answers through the store input check.
 * @invariants A catalog job uses the catalog key of the default profile.
 * The job text, the copy publication, and the answer rule are the command rules.
 */
async function compact(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
): Promise<unknown> {
	const catalog = fields.catalog === true;
	const target = catalog ? catalogKey(runtime.config.defaultProfile) : scope;
	const keys = runtimeVisibleScopes(runtime);
	const treeOf = (projection: Projection) =>
		catalog
			? catalogTree(projection, runtime.config.defaultProfile, keys)
			: scopeTree(projection, target);
	if (fields.action === "compact") {
		const job = await prepareCompact(runtime, target, treeOf);
		debug("Job prepared", {
			event: "compact",
			target,
			inputs: job.inputs.length,
			copies: job.published,
		});
		return { inputs: job.inputs, job: job.job, copies: job.published };
	}
	const answers = parseAnswers(text(fields, "answers"));
	const copied = Array.isArray(fields.inputs) ? fields.inputs : null;
	if (copied === null)
		throw new MemlensError("Usage", "The answer needs copied inputs.");
	const { built, rejected } = await applyAnswers(
		runtime,
		target,
		treeOf(await runtime.store.projection()),
		answers,
		copied as readonly BuildInput[],
	);
	debug("Answers applied", {
		event: "compact-answer",
		target,
		built,
		rejected,
	});
	return { built, rejected };
}
// #endregion FUNC_compact

function text(fields: Fields, key: string): string {
	const value = fields[key];
	if (value === undefined) return "";
	if (typeof value !== "string")
		throw new MemlensError("Usage", `The field ${key} must be text.`);
	return value;
}
function matches(runtime: Runtime, scope: ScopeKey): boolean {
	return profileLists(runtime, scope);
}
function allowedScope(runtime: Runtime, raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw) as ScopeKey;
	if (!validateScopeKey(scope))
		throw new MemlensError("Usage", "The scope key is invalid.");
	if (!matches(runtime, scope))
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return scope;
}
function targetRecord(runtime: Runtime, fallback: ScopeKey, target: string) {
	const address = parseAddress(target);
	if (!address || address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", "The target must name one note.");
	const scope = allowedScope(runtime, address.scope ?? fallback);
	const record = (runtime.projection.byScope.get(scope) ?? []).find(
		(record) => record.pos === address.pos,
	);
	if (!record) throw new MemlensError("Data", "The note does not exist.");
	return record;
}
function noteKind(raw: string): NoteKind {
	if (!(KINDS as readonly string[]).includes(raw))
		throw new MemlensError("Usage", "The kind is unknown.");
	return raw as NoteKind;
}
async function pendingProposals(runtime: Runtime) {
	const events = await runtime.store.export(null);
	const dismissed = new Set(
		events
			.filter((event) => event.op === "dismiss")
			.map((event) => event.target),
	);
	return events.filter(
		(event): event is Extract<Event, { proposed?: true }> =>
			"proposed" in event &&
			event.proposed === true &&
			event.redacted !== true &&
			!dismissed.has(event.id) &&
			!isCatalogKey(event.scope),
	);
}
// #region FUNC_readBody
/**
 * @purpose Reject oversized or malformed action payloads before the host opens a store.
 * @invariants Require a JSON object and at most 2 MiB. The limit accommodates 50 copied inputs and their answers.
 * A parse failure writes nothing.
 */
async function readBody(request: IncomingMessage): Promise<Fields> {
	if (
		request.headers["content-type"]?.split(";")[0]?.trim() !==
		"application/json"
	)
		throw new MemlensError("Usage", "The action needs application/json.");
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > 2 * 1024 * 1024)
			throw new MemlensError("Usage", "The request body is too large.");
		chunks.push(chunk);
	}
	let value: unknown;
	try {
		value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new MemlensError("Usage", "The request body must be JSON.");
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new MemlensError("Usage", "The action must be an object.");
	return value as Fields;
}
// #endregion FUNC_readBody

function send(response: ServerResponse, status: number, value: unknown) {
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
	});
	response.end(JSON.stringify(value));
}
