// #region moduleContract

/**
 * @purpose Give a human a local console without the harness.
 * @scope Loopback HTTP, static assets, profile reads, note actions, proposals, and compaction answers.
 * @invariants Bind only to 127.0.0.1. Reject foreign hosts and origins. Never enable CORS.
 * @invariants Writes require JSON. Delete requires --allow-delete and explicit confirmation.
 * @invariants Each request opens its selected profile and closes its store, including on failure.
 */

// #endregion moduleContract

import { once } from "node:events";
import { readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { debuglog } from "node:util";
import {
	accept,
	addDaysAtTime,
	amend,
	amendTx,
	type BuildInput,
	byAddress,
	dismiss,
	filterHits,
	hide,
	hideTx,
	linkSupersedes,
	loadRangeView,
	MemlensError,
	type Note,
	type NoteKind,
	note,
	noteCheckedTx,
	nowIso,
	openNote,
	openRange,
	parseAddress,
	pending,
	readConsole,
	redact,
	review,
	reviewTx,
	type ScopeKey,
	scopeNotes,
	search,
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

/** @purpose Start a standalone console and return its address and shutdown operation. */
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
		response.writeHead(200, { "Content-Type": asset[1] });
		response.end(await readFile(new URL(`./ui/${asset[0]}`, import.meta.url)));
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
			requested || (profileLists(runtime, fallback) ? fallback : first),
		);
		let result: unknown;
		switch (url.pathname) {
			case "/api/view": {
				const kind = text(fields, "kind");
				const model = await readConsole(
					runtime.store,
					runtime.config,
					scope,
					undefined,
					kind ? noteKind(kind) : null,
				);
				result = {
					...model,
					proposals: pending(runtime.store),
					profiles: Object.keys(runtime.base.profile),
					path: runtime.path,
					backend: "sqlite",
					allowDelete: options.allowDelete === true,
					reviewPolicy: runtime.config.review,
				};
				break;
			}
			case "/api/search": {
				const raw = text(fields, "limit") || "10";
				if (!/^\d+$/.test(raw) || Number(raw) > 1000)
					throw new MemlensError(
						"Usage",
						"The limit must be between 0 and 1000.",
					);
				const scopes = requested ? [scope] : visible;
				const hits = scopes.flatMap((key) =>
					search(runtime.store, text(fields, "query"), key, 50),
				);
				const kind = text(fields, "kind");
				result = filterHits(
					hits,
					{
						scopes,
						limit: Number(raw),
						since: text(fields, "since"),
						...(kind ? { kinds: [noteKind(kind)] } : {}),
					},
					nowIso(),
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
						loadRangeView(runtime.store, key),
						address.start,
						address.end,
					);
				else {
					const row = byAddress(runtime.store, key, address.pos);
					if (!row) throw new MemlensError("Data", "The note does not exist.");
					result = openNote(key, row, "all");
				}
				break;
			}
			case "/api/catalog": {
				const start = Number(text(fields, "start"));
				const level = Number(text(fields, "level"));
				if (
					!Number.isInteger(start) ||
					start < 0 ||
					!Number.isInteger(level) ||
					level < 1 ||
					level > 31
				)
					throw new MemlensError(
						"Usage",
						"The catalog target must be a range.",
					);
				const model = await readConsole(runtime.store, runtime.config, scope);
				result = model.catalog.slice(start, start + 2 ** level);
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

/** @purpose Apply a human edit through the row-store operations. */
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
		const saved = note(runtime.store, {
			scope,
			body: text(fields, "body"),
			kind,
			longform: text(fields, "longform"),
			...(supersedes.length ? { supersedes } : {}),
			ts: nowIso(),
			review_at: addDaysAtTime(Date.now(), runtime.config.review[kind]),
			session: "ui",
			turn: "ui",
			preset: "ui",
		});
		if (!saved.ok) return { duplicate: true };
		return { id: saved.value.id };
	}
	if (action === "accept" || action === "dismiss") {
		const proposal = pending(runtime.store).find(
			(item) => item.id === text(fields, "target"),
		);
		if (!proposal)
			throw new MemlensError("Data", "The proposal is no longer pending.");
		if (action === "dismiss") dismiss(runtime.store, proposal.id);
		else
			accept(
				runtime.store,
				proposal.id,
				(payload, tx) => {
					const data = payload as {
						body?: string;
						kind?: NoteKind;
						target?: string;
						scope?: ScopeKey;
						review_at?: string | null;
						longform?: string;
					};
					if (proposal.op === "note")
						noteCheckedTx(tx, {
							scope: proposal.scope,
							body: data.body ?? "",
							kind: data.kind ?? "note",
							ts: nowIso(),
							review_at: data.review_at ?? null,
							session: "ui",
							turn: "ui",
							preset: "ui",
							...(data.longform ? { longform: data.longform } : {}),
						});
					else if (proposal.target) {
						if (proposal.op === "supersede") {
							const targetId = proposal.target as Note["id"];
							const payloadNote = data as {
								scope: ScopeKey;
								body: string;
								kind: NoteKind;
								review_at?: string | null;
								longform?: string;
							};
							noteCheckedTx(tx, {
								scope: payloadNote.scope,
								body: payloadNote.body,
								kind: payloadNote.kind,
								review_at: payloadNote.review_at ?? null,
								session: "ui",
								turn: "ui",
								preset: "ui",
								supersedes: [targetId],
								...(payloadNote.longform
									? { longform: payloadNote.longform }
									: {}),
							});
						}
						if (proposal.op === "hide")
							hideTx(tx, { id: proposal.target as Note["id"] });
						else if (proposal.op === "review")
							reviewTx(tx, {
								id: proposal.target as Note["id"],
								reviewAt: data.review_at ?? null,
							});
						else if (proposal.op === "amend")
							amendTx(tx, {
								id: proposal.target as Note["id"],
								...(data.body ? { body: data.body } : {}),
								...(data.longform ? { longform: data.longform } : {}),
								...(data.scope ? { scope: data.scope } : {}),
							});
					}
				},
				[...runtimeVisibleScopes(runtime), proposal.scope],
			);
		return { ok: true };
	}
	if (action === "scope-forget" || action === "scope-delete") {
		if (fields.confirm !== true)
			throw new MemlensError(
				"NotAllowed",
				"The scope action needs confirmation.",
			);
		const rows = scopeNotes(runtime.store, scope).filter((row) =>
			action === "scope-delete"
				? row.state !== "deleted"
				: row.state === "live",
		);
		for (const row of rows)
			action === "scope-delete"
				? redact(runtime.store, row.id, "ui scope action")
				: hide(runtime.store, row.id, "ui scope action");
		return { changed: rows.length };
	}
	const record = targetRecord(runtime, scope, text(fields, "target"));
	switch (action) {
		case "amend": {
			const destination = text(fields, "dest") || record.scope;
			const kind = text(fields, "kind");
			const targets = text(fields, "supersedes")
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
			if (targets.length > 0)
				linkSupersedes(
					runtime.store,
					record.id,
					targets.map(
						(target) =>
							targetRecord(runtime, allowedScope(runtime, destination), target)
								.id,
					),
				);
			amend(runtime.store, {
				id: record.id,
				scope: allowedScope(runtime, destination),
				body: text(fields, "body"),
				longform: text(fields, "longform"),
				...(kind ? { kind: noteKind(kind) } : {}),
			});
			break;
		}
		case "review":
			review(
				runtime.store,
				record.id,
				addDaysAtTime(Date.now(), runtime.config.review[record.kind]),
			);
			break;
		case "forget":
			hide(runtime.store, record.id, "ui action");
			break;
		case "delete":
			redact(runtime.store, record.id, "ui action");
			break;
		default:
			throw new MemlensError("Usage", "The action is unknown.");
	}
	debug("Action done", { event: "applied", action, id: record.id });
	return { ok: true };
}

// #endregion FUNC_applyAction

// #region FUNC_compact

/** @purpose Give merge inputs for one scope and publish answers through row build checks. */
async function compact(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
): Promise<unknown> {
	if (fields.catalog === true)
		throw new MemlensError(
			"Usage",
			"The catalog is derived and holds no nodes. Compact one scope.",
		);
	const target = scope;
	if (fields.action === "compact") {
		const job = await prepareCompact(runtime, target, {
			scopeKeys: runtimeVisibleScopes(runtime),
		});
		return {
			inputs: job.inputs,
			job: job.job,
			copies: job.published - job.joined,
			joins: job.joined,
		};
	}
	const answers = parseAnswers(text(fields, "answers"));
	const copied = Array.isArray(fields.inputs)
		? (fields.inputs as readonly BuildInput[])
		: null;
	if (!copied)
		throw new MemlensError("Usage", "The answer needs copied inputs.");
	const { built, rejected } = await applyAnswers(
		runtime,
		target,
		null,
		answers,
		copied,
	);
	return { built, rejected: rejected.length, rejectedRanges: rejected };
}

// #endregion FUNC_compact

function text(fields: Fields, key: string): string {
	const value = fields[key];
	if (value === undefined) return "";
	if (typeof value !== "string")
		throw new MemlensError("Usage", `The field ${key} must be text.`);
	return value;
}
function allowedScope(runtime: Runtime, raw: string): ScopeKey {
	if (!validateScopeKey(raw))
		throw new MemlensError("Usage", "The scope key is invalid.");
	if (!profileLists(runtime, raw))
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return raw;
}
function targetRecord(
	runtime: Runtime,
	fallback: ScopeKey,
	target: string,
): Note {
	const address = parseAddress(target);
	if (!address || address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", "The target must name one note.");
	const scope = allowedScope(runtime, address.scope ?? fallback);
	const row = byAddress(runtime.store, scope, address.pos);
	if (!row) throw new MemlensError("Data", "The note does not exist.");
	return row;
}
function noteKind(raw: string): NoteKind {
	if (!(KINDS as readonly string[]).includes(raw))
		throw new MemlensError("Usage", "The kind is unknown.");
	return raw as NoteKind;
}

// #region FUNC_readBody

/** @purpose Reject oversized or malformed action payloads before the host opens a store. */
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
