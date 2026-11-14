/**
 * #region moduleContract
 * @purpose Prove the console route, the reads, the actions, and the status through the actual
 *   plugin service and the actual store.
 * @scope The trust answer, the route answers, the session and scope resolution, each action, the
 *   status answer, and the disposer.
 * @invariants Tests use a temporary XDG root and a temporary store per case, and clean them up.
 * @invariants Tests use a stub Web server, a stub Connection service, and a stub LLM. No test
 *   opens a socket and no test makes a paid call.
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { debuglog } from "node:util";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { createScope } from "@deepseek-ai/dsh-scope";
import {
	byAddress,
	type CompactionConfig,
	DEFAULT_CONFIG_TOML,
	note,
	propose,
	type StoreConfig,
	toIso,
	ttlSeconds,
} from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerConsole } from "../src/console/http.js";
import { Memlens } from "../src/service.js";
import { MemoryWorker, type WorkerLlm } from "../src/worker.js";

const debug = debuglog("memlens:plugin:console:test");

/** The roots and the temporary directories of the running case. */
const roots: Context[] = [];

/** The temporary directories of the running case. */
const directories: string[] = [];

/** The next session number of the running case. */
let nextSession = 0;

afterEach(async () => {
	vi.useRealTimers();
	for (const root of roots.splice(0)) await root.fiber.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// #region CLASS_StubLlm
/** @purpose Answer one merge call with a scripted text, or fail it. */
class StubLlm implements WorkerLlm {
	answer = "one line summary";
	fail = false;

	stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
		const answer = this.answer;
		const fail = this.fail;
		return (async function* (): AsyncGenerator<StreamChunk> {
			if (fail) throw new Error("stub refusal");
			yield { type: "text-delta", index: 0, text: answer };
			yield { type: "finish", reason: { kind: "stop" } };
		})();
	}
}
// #endregion CLASS_StubLlm

// #region INTERFACE_RecordedRoute
/** One route that the stub Web server recorded. */
interface RecordedRoute {
	kind: string;
	path: string;
	handler: (
		request: IncomingMessage,
		response: ServerResponse,
	) => void | Promise<void>;
}
// #endregion INTERFACE_RecordedRoute

// #region INTERFACE_Case
/** One running console case. */
interface Case {
	readonly root: Context;
	readonly memlens: Memlens;
	readonly worker: MemoryWorker;
	readonly agent: Agent;
	readonly routes: RecordedRoute[];
	readonly llm: StubLlm;
}
// #endregion INTERFACE_Case

// #region FUNC_subject
/** @purpose Create one agent subject with a real scoped context and a controlled route. */
function subject(root: Context): Agent {
	const agent = {} as Agent;
	const scope = createScope(root, agent);
	Object.assign(agent, {
		id: `session-${nextSession++}`,
		ctx: scope.ctx,
		session: {
			header: { cwd: tmpdir() },
			deriveMessages: () => [],
		},
		model: { current: () => ({ provider: "test", model: "large" }) },
	});
	return agent;
}
// #endregion FUNC_subject

/** @purpose Give the resolved inputs of a worker with plain values. */
function workerInputs(): {
	compaction: CompactionConfig;
	store: StoreConfig;
	cacheTtl: Record<string, number>;
} {
	return {
		compaction: {
			provider: "test",
			model: "merge-model",
			effort: "",
			mode: "parallel",
			batch: 1,
			maxCallsPerHour: 60,
		},
		store: { path: "unused", idle: 300 },
		cacheTtl: {},
	};
}

// #region FUNC_composition
/**
 * @purpose Start the real host service under a temporary configuration root and a stub carrier.
 * @param options - An optional base file, an optional Connection stub, and the Web server choice.
 */
function composition(
	options: {
		readonly base?: string;
		readonly connection?: unknown;
		readonly webServer?: boolean;
	} = {},
): Case {
	const directory = mkdtempSync(join(tmpdir(), "memlens-console-"));
	directories.push(directory);
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	if (options.base !== undefined) {
		mkdirSync(join(directory, "memlens"));
		writeFileSync(join(directory, "memlens", "config.toml"), options.base);
	}
	const root = new Context();
	roots.push(root);
	const memlens = new Memlens(root, {});
	const agent = subject(root);
	root.provide("agents", {
		get: (id: string) => (id === agent.id ? agent : undefined),
	} as unknown as Context["agents"]);
	if (options.connection !== undefined)
		root.provide("connection", options.connection);
	const routes: RecordedRoute[] = [];
	if (options.webServer !== false)
		root.provide("webServer", {
			register: (route: RecordedRoute) => {
				routes.push(route);
				return () => {
					const index = routes.indexOf(route);
					if (index >= 0) routes.splice(index, 1);
				};
			},
		});
	const llm = new StubLlm();
	const worker = new MemoryWorker(root, memlens.store, workerInputs(), llm);
	debug("Case start", { event: "start", directory, session: agent.id });
	return { root, memlens, worker, agent, routes, llm };
}
// #endregion FUNC_composition

/** @purpose Create one request with a body stream and the headers of the console client. */
function requestOf(
	method: string,
	url: string,
	body?: unknown,
): IncomingMessage {
	const text = body === undefined ? "" : JSON.stringify(body);
	const stream = Readable.from(text === "" ? [] : [Buffer.from(text)]);
	const headers: Record<string, string> =
		body === undefined ? {} : { "content-type": "application/json" };
	return Object.assign(stream, {
		method,
		url,
		headers,
	}) as unknown as IncomingMessage;
}

// #region FUNC_call
/**
 * @purpose Answer one request through the route of the stub Web server.
 * @param testCase - The running console case.
 * @param method - The HTTP method of the request.
 * @param suffix - The path after the route prefix.
 * @param options - The query fields, the body, and the session choice.
 */
async function call(
	testCase: Case,
	method: "GET" | "POST",
	suffix: string,
	options: {
		readonly query?: Record<string, string>;
		readonly body?: unknown;
		readonly session?: string | null;
	} = {},
): Promise<{
	readonly status: number;
	// biome-ignore lint/suspicious/noExplicitAny: The answer body differs for each case.
	readonly value: any;
	readonly headers: Record<string, unknown>;
}> {
	const route = testCase.routes[0];
	if (route === undefined) throw new Error("The console route is absent.");
	const query = new URLSearchParams(options.query ?? {});
	const session =
		options.session === undefined ? testCase.agent.id : options.session;
	if (session !== null) query.set("session", session);
	const url = `/plugins/memlens${suffix}${query.size > 0 ? `?${query}` : ""}`;
	const answer = {
		status: 0,
		headers: {} as Record<string, unknown>,
		body: "",
	};
	const response = {
		headersSent: false,
		writeHead(status: number, headers?: Record<string, string>) {
			answer.status = status;
			Object.assign(answer.headers, headers ?? {});
			response.headersSent = true;
			return response;
		},
		end(body?: string) {
			if (body !== undefined) answer.body = body;
		},
	};
	await route.handler(
		requestOf(method, url, options.body),
		response as unknown as ServerResponse,
	);
	return {
		status: answer.status,
		value: answer.body === "" ? null : JSON.parse(answer.body),
		headers: answer.headers,
	};
}
// #endregion FUNC_call

// #region FUNC_registered
/**
 * @purpose Register the console route and wait until its fiber starts.
 * @invariants The injected fiber runs one tick after the registration.
 * @param testCase - The running console case.
 */
async function registered(testCase: Case): Promise<() => Promise<void>> {
	const dispose = registerConsole(
		testCase.root,
		testCase.memlens,
		testCase.worker,
	);
	await new Promise((resolve) => setImmediate(resolve));
	return dispose;
}
// #endregion FUNC_registered

/** @purpose Insert one note in the default scope at a fixed time. */
function insert(testCase: Case, body: string, day: number): void {
	note(testCase.memlens.store, {
		scope: "user:notes",
		kind: "note",
		body,
		session: "session-test",
		turn: "turn-test",
		preset: "default",
		ts: `2026-01-0${day}T00:00:00.000Z`,
	});
}

describe("console route", () => {
	it("registers one prefix route and removes it with its disposer", async () => {
		const testCase = composition();
		expect(testCase.routes).toHaveLength(0);
		const dispose = await registered(testCase);
		expect(testCase.routes).toHaveLength(1);
		expect(testCase.routes[0]?.kind).toBe("prefix");
		expect(testCase.routes[0]?.path).toBe("/plugins/memlens");
		await dispose();
		expect(testCase.routes).toHaveLength(0);
	});

	it("registers no route without a web server", async () => {
		const testCase = composition({ webServer: false });
		const dispose = await registered(testCase);
		expect(testCase.routes).toHaveLength(0);
		await expect(dispose()).resolves.toBeUndefined();
	});

	it("answers the trust rejection of the Connection service", async () => {
		let rejection: 401 | 403 | undefined = 403;
		const testCase = composition({
			connection: { requestRejection: () => rejection },
		});
		await registered(testCase);
		const forbidden = await call(testCase, "GET", "/view");
		expect(forbidden.status).toBe(403);
		expect(forbidden.value.error).toMatch(/this console/);
		rejection = 401;
		const unauthenticated = await call(testCase, "GET", "/view");
		expect(unauthenticated.status).toBe(401);
		expect(unauthenticated.value.error).toMatch(/authentication/);
		rejection = undefined;
		const allowed = await call(testCase, "GET", "/view");
		expect(allowed.status).toBe(200);
	});

	it("serves requests when the Connection service is absent", async () => {
		const testCase = composition();
		await registered(testCase);
		const answer = await call(testCase, "GET", "/view");
		expect(answer.status).toBe(200);
	});

	it("answers 404 for an unknown path and 405 for a wrong method", async () => {
		const testCase = composition();
		await registered(testCase);
		const unknown = await call(testCase, "GET", "/unknown");
		expect(unknown.status).toBe(404);
		expect(unknown.value).toEqual({ error: "No such route." });
		const wrongRead = await call(testCase, "POST", "/view");
		expect(wrongRead.status).toBe(405);
		const wrongWrite = await call(testCase, "GET", "/action");
		expect(wrongWrite.status).toBe(405);
		expect(wrongWrite.value.error).toMatch(/method/);
	});

	it("answers 404 for an unknown session and 400 for no session", async () => {
		const testCase = composition();
		await registered(testCase);
		const unknown = await call(testCase, "GET", "/view", {
			session: "session-missing",
		});
		expect(unknown.status).toBe(404);
		expect(unknown.value).toEqual({ error: "The session is unknown." });
		const missing = await call(testCase, "GET", "/view", { session: null });
		expect(missing.status).toBe(400);
		expect(missing.value.error).toMatch(/session/);
	});

	it("resolves the profile and the scope from the session, not from the request", async () => {
		const testCase = composition({
			base: DEFAULT_CONFIG_TOML.replace(
				'scopes = ["*"]',
				'scopes = ["user:notes"]',
			),
		});
		await registered(testCase);
		const view = await call(testCase, "GET", "/view", {
			query: { profile: "another", scope: "user:notes" },
		});
		expect(view.status).toBe(200);
		expect(view.value.profile).toBe("default");
		expect(view.value.profiles).toEqual(["default"]);
		const fallback = await call(testCase, "GET", "/view");
		expect(fallback.value.scope).toBe("user:notes");
		const outside = await call(testCase, "GET", "/view", {
			query: { scope: "project:other" },
		});
		expect(outside.status).toBe(403);
		expect(outside.value.error).toMatch(/outside this profile/);
		const invalid = await call(testCase, "GET", "/view", {
			query: { scope: "Bad Key" },
		});
		expect(invalid.status).toBe(400);
		expect(invalid.value.error).toMatch(/invalid/);
	});

	it("answers the view with the model, the proposals, and the policy", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		await registered(testCase);
		const answer = await call(testCase, "GET", "/view");
		expect(answer.status).toBe(200);
		const view = answer.value;
		expect(view.profile).toBe("default");
		expect(view.scope).toBe("user:notes");
		expect(Array.isArray(view.scopes)).toBe(true);
		expect(Array.isArray(view.records)).toBe(true);
		expect(Array.isArray(view.frontier)).toBe(true);
		expect(Array.isArray(view.catalog)).toBe(true);
		expect(view.proposals).toEqual([]);
		expect(view.path).toBe(testCase.memlens.path);
		expect(view.backend).toBe("sqlite");
		expect(view.allowDelete).toBe(true);
		expect(view.reviewPolicy).toBeTypeOf("object");
		expect(answer.headers["Cache-Control"]).toBe("no-store");
		expect(answer.headers["Access-Control-Allow-Origin"]).toBeUndefined();
	});

	it("answers search with the hits and the limit rule", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta gamma", 1);
		await registered(testCase);
		const found = await call(testCase, "GET", "/search", {
			query: { q: "alpha" },
		});
		expect(found.status).toBe(200);
		expect(Array.isArray(found.value)).toBe(true);
		expect(found.value[0]?.scope).toBe("user:notes");
		expect(found.value[0]?.pos).toBe(0);
		const alias = await call(testCase, "GET", "/search", {
			query: { query: "alpha" },
		});
		expect(alias.value).toHaveLength(found.value.length);
		const badLimit = await call(testCase, "GET", "/search", {
			query: { q: "alpha", limit: "many" },
		});
		expect(badLimit.status).toBe(400);
		expect(badLimit.value.error).toMatch(/limit/);
	});

	it("answers open with a note, a range, and an offset", async () => {
		const testCase = composition();
		insert(testCase, `${"long body ".repeat(20)}one`, 1);
		insert(testCase, `${"long body ".repeat(20)}two`, 2);
		await registered(testCase);
		const entry = await call(testCase, "GET", "/open", {
			query: { target: "user:notes#0" },
		});
		expect(entry.status).toBe(200);
		expect(entry.value.kind).toBe("entry");
		expect(entry.value.pos).toBe(0);
		expect(entry.value.scope).toBe("user:notes");
		expect(entry.value.longformChars).toBeTypeOf("number");
		const offset = await call(testCase, "GET", "/open", {
			query: { target: "0", offset: "10" },
		});
		expect(offset.value.longformOffset).toBeGreaterThanOrEqual(10);
		const children = await call(testCase, "GET", "/open", {
			query: { target: "#0-1" },
		});
		expect(children.value.kind).toBe("children");
		expect(Array.isArray(children.value.children)).toBe(true);
		const missing = await call(testCase, "GET", "/open", {
			query: { target: "9" },
		});
		expect(missing.status).toBe(422);
		expect(missing.value.error).toMatch(/does not exist/);
		const badTarget = await call(testCase, "GET", "/open", {
			query: { target: "not an address" },
		});
		expect(badTarget.status).toBe(400);
		const badOffset = await call(testCase, "GET", "/open", {
			query: { target: "0", offset: "half" },
		});
		expect(badOffset.status).toBe(400);
	});

	it("answers catalog with one level and the budget alias", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const lines = await call(testCase, "GET", "/catalog", {
			query: { start: "0", level: "1" },
		});
		expect(lines.status).toBe(200);
		expect(Array.isArray(lines.value)).toBe(true);
		const alias = await call(testCase, "GET", "/catalog", {
			query: { start: "0", budget: "1" },
		});
		expect(alias.status).toBe(200);
		expect(alias.value).toEqual(lines.value);
		const bad = await call(testCase, "GET", "/catalog", {
			query: { start: "0", level: "0" },
		});
		expect(bad.status).toBe(400);
		expect(bad.value.error).toMatch(/range/);
	});
});

describe("console actions", () => {
	it("saves a note and reports a duplicate", async () => {
		vi.useFakeTimers({
			now: new Date("2026-01-01T00:00:00.000Z"),
			toFake: ["Date"],
		});
		const testCase = composition();
		await registered(testCase);
		const saved = await call(testCase, "POST", "/action", {
			body: { action: "note", scope: "user:notes", body: "first record" },
		});
		expect(saved.status).toBe(200);
		expect(saved.value.id).toBeTypeOf("string");
		const duplicate = await call(testCase, "POST", "/action", {
			body: { action: "note", scope: "user:notes", body: "first record" },
		});
		expect(duplicate.value).toEqual({ duplicate: true });
		const two = await call(testCase, "GET", "/view");
		expect(two.value.records).toHaveLength(1);
	});

	it("amends, reviews, hides, and deletes one note", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const amended = await call(testCase, "POST", "/action", {
			body: {
				action: "amend",
				target: "user:notes#0",
				dest: "user:notes",
				body: "changed body",
				kind: "fact",
			},
		});
		expect(amended.value).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.body).toBe(
			"changed body",
		);
		const reviewed = await call(testCase, "POST", "/action", {
			body: { action: "review", target: "0" },
		});
		expect(reviewed.value).toEqual({ ok: true });
		const forgotten = await call(testCase, "POST", "/action", {
			body: { action: "forget", target: "1" },
		});
		expect(forgotten.value).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 1)?.state).toBe(
			"hidden",
		);
		const refused = await call(testCase, "POST", "/action", {
			body: { action: "delete", target: "0" },
		});
		expect(refused.status).toBe(403);
		expect(refused.value.error).toMatch(/confirmation/);
		const deleted = await call(testCase, "POST", "/action", {
			body: { action: "delete", target: "0", confirm: true },
		});
		expect(deleted.value).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.state).toBe(
			"deleted",
		);
		const unknown = await call(testCase, "POST", "/action", {
			body: { action: "shout", target: "0" },
		});
		expect(unknown.status).toBe(400);
		expect(unknown.value.error).toMatch(/unknown/);
	});

	it("inside one scope, changes the scope and the kind of one note", async () => {
		const testCase = composition({
			base: DEFAULT_CONFIG_TOML.replace(
				'scopes = ["*"]',
				'scopes = ["user:notes", "project:moved"]',
			),
		});
		insert(testCase, "alpha beta", 1);
		await registered(testCase);
		const moved = await call(testCase, "POST", "/action", {
			body: {
				action: "amend",
				target: "user:notes#0",
				dest: "project:moved",
				body: "alpha beta",
				kind: "decision",
			},
		});
		expect(moved.value).toEqual({ ok: true });
		const row = byAddress(testCase.memlens.store, "project:moved", 0);
		expect(row?.kind).toBe("decision");
		expect(row?.body).toBe("alpha beta");
	});

	it("accepts and dismisses one proposal", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		await registered(testCase);
		const row = byAddress(testCase.memlens.store, "user:notes", 0);
		if (row === null) throw new Error("The note is absent.");
		const accepted = propose(testCase.memlens.store, {
			scope: "user:notes",
			op: "hide",
			target: row.id,
			payload: {},
		});
		const accept = await call(testCase, "POST", "/action", {
			body: { action: "accept", target: accepted.id },
		});
		expect(accept.value).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.state).toBe(
			"hidden",
		);
		const stale = await call(testCase, "POST", "/action", {
			body: { action: "accept", target: accepted.id },
		});
		expect(stale.status).toBe(422);
		expect(stale.value.error).toMatch(/no longer pending/);
		const dismissed = propose(testCase.memlens.store, {
			scope: "user:notes",
			op: "review",
			target: row.id,
			payload: { review_at: null },
		});
		const dismiss = await call(testCase, "POST", "/action", {
			body: { action: "dismiss", target: dismissed.id },
		});
		expect(dismiss.value).toEqual({ ok: true });
	});

	it("forgets or deletes one scope with confirmation", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const refused = await call(testCase, "POST", "/action", {
			body: { action: "scope-delete", scope: "user:notes" },
		});
		expect(refused.status).toBe(403);
		const hidden = await call(testCase, "POST", "/action", {
			body: { action: "scope-forget", scope: "user:notes", confirm: true },
		});
		expect(hidden.value).toEqual({ changed: 2 });
		const deleted = await call(testCase, "POST", "/action", {
			body: { action: "scope-delete", scope: "user:notes", confirm: true },
		});
		expect(deleted.value).toEqual({ changed: 2 });
	});

	it("prepares a compaction job and applies its answer", async () => {
		const testCase = composition();
		insert(testCase, `${"long body ".repeat(40)}one`, 1);
		insert(testCase, `${"long body ".repeat(40)}two`, 2);
		await registered(testCase);
		const job = await call(testCase, "POST", "/action", {
			body: { action: "compact", scope: "user:notes" },
		});
		expect(job.status).toBe(200);
		expect(job.value.inputs).toHaveLength(1);
		expect(job.value.job).toContain("#0-1");
		expect(job.value.copies).toBeTypeOf("number");
		expect(job.value.joins).toBeTypeOf("number");
		const applied = await call(testCase, "POST", "/action", {
			body: {
				action: "compact-answer",
				scope: "user:notes",
				answers: "#0-1: merged line",
				inputs: job.value.inputs,
			},
		});
		expect(applied.status).toBe(200);
		expect(applied.value.built).toBe(1);
		expect(applied.value.rejected).toBe(0);
		expect(applied.value.rejectedRanges).toEqual([]);
		const missing = await call(testCase, "POST", "/action", {
			body: {
				action: "compact-answer",
				scope: "user:notes",
				answers: "#0-1: x",
			},
		});
		expect(missing.status).toBe(400);
		expect(missing.value.error).toMatch(/copied inputs/);
	});
});

describe("console status", () => {
	it("answers the snapshot and the compaction state", async () => {
		const testCase = composition();
		await registered(testCase);
		testCase.root.emit(
			"session/event",
			testCase.agent.session as never,
			{
				type: "user/message",
				seq: 0,
				time: 1_000,
				data: {
					role: "user",
					id: "message-1",
					content: [{ type: "text", text: "runtime context" }],
					source: {
						kind: "runtime-context",
						form: "snapshot",
						sections: [{ name: "memlens", text: "memory slice" }],
					},
				},
			} as never,
		);
		const answer = await call(testCase, "GET", "/status");
		expect(answer.status).toBe(200);
		expect(answer.value.session).toBe(testCase.agent.id);
		expect(answer.value.scope).toBe("user:notes");
		expect(answer.value.snapshot.saved).toBe(false);
		expect(answer.value.snapshot.materializedAt).toBe(toIso(1_000));
		expect(answer.value.snapshot.nextTrigger).toBe("idle");
		const ttl = ttlSeconds(
			testCase.memlens.forAgent(testCase.agent).config.cacheTtl,
			"test/large",
		);
		expect(answer.value.snapshot.nextRefreshAt).toBe(toIso(1_000 + ttl * 1000));
		expect(answer.value.compaction).toEqual({
			attempts: 0,
			active: 0,
			backoff: 0,
			failures: 0,
			dirty: 0,
		});
	});

	it("reads the saved snapshot from the derived history", async () => {
		const testCase = composition();
		Object.assign(testCase.agent.session, {
			deriveMessages: () => [
				{
					role: "user",
					id: "message-1",
					content: [{ type: "text", text: "runtime context" }],
					source: {
						kind: "runtime-context",
						form: "snapshot",
						sections: [{ name: "memlens", text: "memory slice" }],
					},
				},
			],
		});
		await registered(testCase);
		const answer = await call(testCase, "GET", "/status");
		expect(answer.value.snapshot.saved).toBe(true);
		expect(answer.value.snapshot.chars).toBe("memory slice".length);
		expect(answer.value.snapshot.materializedAt).toBe(null);
		expect(answer.value.snapshot.nextRefreshAt).toBe(null);
	});

	it("states the local compaction counts of the worker", async () => {
		const testCase = composition();
		insert(testCase, `${"long body ".repeat(40)}one`, 1);
		insert(testCase, `${"long body ".repeat(40)}two`, 2);
		expect(testCase.worker.status().dirty).toBeGreaterThan(0);
		testCase.worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(testCase.worker.status().attempts).toBe(1));
		await vi.waitFor(() => expect(testCase.worker.status().dirty).toBe(0));
		const done = testCase.worker.status();
		expect(done.failures).toBe(0);
		expect(done.active).toBe(0);
		expect(done.backoff).toBe(0);
		testCase.llm.fail = true;
		insert(testCase, `${"more body ".repeat(40)}three`, 3);
		insert(testCase, `${"more body ".repeat(40)}four`, 4);
		testCase.worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(testCase.worker.status().failures).toBe(1));
		const failed = testCase.worker.status();
		expect(failed.backoff).toBeGreaterThan(0);
		expect(failed.dirty).toBeGreaterThan(0);
	});
});
