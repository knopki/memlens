/**
 * #region moduleContract
 * @purpose Prove the console Remote service, the reads, the actions, and the status through the
 *   actual Typert registry, the actual plugin service, and the actual store.
 * @scope The registration and its disposer, the descriptor call path, the session and scope
 *   resolution, each read, each action, the status answer, and the strict result codec.
 * @invariants Tests use a temporary XDG root and a temporary store per case, and clean them up.
 * @invariants Tests use the real registry and a stub LLM. No test opens a socket and no test makes
 *   a paid call.
 * @invariants The call helper follows the installed Gateway: resolve the local descriptor, parse the
 *   strict input codec, call the service method, then encode the answer through the strict result
 *   codec.
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { debuglog } from "node:util";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { createScope } from "@deepseek-ai/dsh-scope";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
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
import { registerConsoleRemote } from "../src/console/remote.js";
import {
	CONSOLE_NAMESPACE,
	CONSOLE_SERVICE,
	type ConsoleMethod,
	type ConsoleResults,
} from "../src/console/remote-contract.js";
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

// #region FUNC_snapshotOf
/**
 * @purpose Give the snapshot of one status answer, so a test reads it with no optional field.
 * @invariants A session status answer always holds a snapshot.
 */
function snapshotOf(answer: {
	readonly snapshot?:
		| {
				readonly saved: boolean;
				readonly chars: number;
				readonly materializedAt: string | null;
				readonly nextTrigger: string;
				readonly nextRefreshAt: string | null;
		  }
		| undefined;
}): NonNullable<typeof answer.snapshot> {
	if (answer.snapshot === undefined)
		throw new Error("The status answer holds no snapshot.");
	return answer.snapshot;
}
// #endregion FUNC_snapshotOf

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

// #region INTERFACE_Case
/** One running console case. */
interface Case {
	readonly root: Context;
	readonly memlens: Memlens;
	readonly worker: MemoryWorker;
	readonly agent: Agent;
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

/** The base file of the cases: the built-in file with a stated fallback scope key. */
const CASE_BASE = DEFAULT_CONFIG_TOML.replace(
	'default = "project:misc"',
	'default = "user:notes"',
).replace(
	"rules = []",
	'rules = [{ match = "path", glob = "*", key = "user:notes" }]',
);

// #region FUNC_composition
/**
 * @purpose Start the real host service and the real registry under a temporary configuration root.
 * @param options - An optional base file and the Typert registry choice.
 */
function composition(
	options: { readonly base?: string; readonly typert?: boolean } = {},
): Case {
	const directory = mkdtempSync(join(tmpdir(), "memlens-console-"));
	directories.push(directory);
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	mkdirSync(join(directory, "memlens"));
	writeFileSync(
		join(directory, "memlens", "config.toml"),
		options.base ?? CASE_BASE,
	);
	const root = new Context();
	roots.push(root);
	const memlens = new Memlens(root, {});
	const agent = subject(root);
	root.provide("agents", {
		get: (id: string) => (id === agent.id ? agent : undefined),
	} as unknown as Context["agents"]);
	if (options.typert !== false) new TypertRegistry(root);
	const llm = new StubLlm();
	const worker = new MemoryWorker(root, memlens.store, workerInputs(), llm);
	debug("Case start", { event: "start", directory, session: agent.id });
	return { root, memlens, worker, agent, llm };
}
// #endregion FUNC_composition

// #region FUNC_registered
/**
 * @purpose Register the console Remote and wait until its fiber starts.
 * @invariants The injected fiber runs one tick after the registration.
 * @param testCase - The running console case.
 */
async function registered(testCase: Case): Promise<() => Promise<void>> {
	const dispose = registerConsoleRemote(
		testCase.root,
		testCase.memlens,
		testCase.worker,
	);
	await new Promise((resolve) => setImmediate(resolve));
	return dispose;
}
// #endregion FUNC_registered

// #region FUNC_call
/**
 * @purpose Answer one call through the local descriptor, as the installed Gateway does.
 * @invariants The strict input codec of the descriptor parses the input before the call.
 * @param testCase - The running console case.
 * @param method - The console method of the call.
 * @param input - The input object of the call.
 */
async function call<M extends ConsoleMethod>(
	testCase: Case,
	method: M,
	input: Record<string, unknown> = {},
): Promise<ConsoleResults[M]> {
	const endpoint = `${CONSOLE_NAMESPACE}/${method}`;
	const descriptor = testCase.root.typert.local.get(endpoint);
	if (descriptor === undefined)
		throw new Error(`The ${endpoint} endpoint is absent.`);
	const parameter = descriptor.parameters[0];
	if (parameter === undefined || descriptor.parameters.length !== 1)
		throw new Error(`The ${endpoint} endpoint needs one input parameter.`);
	if (parameter.codec.mode !== "strict")
		throw new Error(`The ${endpoint} input codec is not strict.`);
	const receiver = testCase.root.get(descriptor.service) as
		| Record<string, ((value: unknown) => Promise<unknown>) | undefined>
		| undefined;
	const invoke = receiver?.[method];
	if (typeof invoke !== "function")
		throw new Error(`The ${endpoint} method is absent.`);
	const value = parameter.codec.create().parse(input);
	const answer = await invoke.call(receiver, value);
	// The Gateway encodes through the strict result codec, so the test does the same.
	if (descriptor.result.mode !== "strict") return answer as ConsoleResults[M];
	const encode = descriptor.result.encode;
	return (
		encode === undefined ? answer : encode(answer, () => null)
	) as ConsoleResults[M];
}
// #endregion FUNC_call

// #region FUNC_direct
/**
 * @purpose Call one service method with no descriptor codec, so an operation guard is reachable.
 * @param testCase - The running console case.
 * @param method - The console method of the call.
 * @param input - The raw input object of the call.
 */
async function direct(
	testCase: Case,
	method: ConsoleMethod,
	input: unknown,
): Promise<unknown> {
	const receiver = testCase.root.get(CONSOLE_SERVICE) as
		| Record<string, ((value: unknown) => Promise<unknown>) | undefined>
		| undefined;
	const invoke = receiver?.[method];
	if (typeof invoke !== "function")
		throw new Error(`The ${method} method is absent.`);
	return invoke.call(receiver, input);
}
// #endregion FUNC_direct

// #region FUNC_failure
/**
 * @purpose Give the code and the message of one failed call.
 * @invariants The call must fail, and the error keeps the Remote code and the cause text.
 * @param promise - The pending call.
 */
async function failure(
	promise: Promise<unknown>,
): Promise<{ code: string | undefined; message: string }> {
	try {
		await promise;
	} catch (error) {
		return {
			code: (error as { code?: string }).code,
			message: error instanceof Error ? error.message : String(error),
		};
	}
	throw new Error("The call did not fail.");
}
// #endregion FUNC_failure

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

describe("console remote registration", () => {
	it("registers one method for each operation and removes them with its disposer", async () => {
		const testCase = composition();
		expect(testCase.root.typert.local.list()).toHaveLength(0);
		const dispose = await registered(testCase);
		const live = testCase.root.typert.local.list();
		expect(live.map((descriptor) => descriptor.method)).toEqual([
			"view",
			"search",
			"open",
			"catalog",
			"status",
			"action",
		]);
		expect(
			live.every(
				(descriptor) =>
					descriptor.namespace === CONSOLE_NAMESPACE &&
					descriptor.service === CONSOLE_SERVICE,
			),
		).toBe(true);
		expect(live[0]?.id).toBe("@memlens/dsh-plugin#memlens/view");
		const binding = (
			testCase.root.get(CONSOLE_SERVICE) as {
				readonly typertRemote: {
					readonly serviceKey: string;
					readonly namespace: string;
				};
			}
		).typertRemote;
		expect(binding.serviceKey).toBe(CONSOLE_SERVICE);
		expect(binding.namespace).toBe(CONSOLE_NAMESPACE);
		const stopped = dispose();
		await expect(stopped).resolves.toBeUndefined();
		expect(testCase.root.typert.local.list()).toHaveLength(0);
		expect(testCase.root.get(CONSOLE_SERVICE)).toBeUndefined();
	});

	it("registers nothing without a Typert service", async () => {
		const testCase = composition({ typert: false });
		const dispose = await registered(testCase);
		expect(testCase.root.get(CONSOLE_SERVICE)).toBeUndefined();
		await expect(dispose()).resolves.toBeUndefined();
	});

	it("rejects an unknown input field before the operation", async () => {
		const testCase = composition();
		await registered(testCase);
		const descriptor = testCase.root.typert.local.get("memlens/view");
		expect(descriptor).toBeDefined();
		const codec = descriptor?.parameters[0]?.codec;
		expect(codec?.mode).toBe("strict");
		expect(() =>
			codec?.mode === "strict"
				? codec.create().parse({ session: testCase.agent.id, bogus: 1 })
				: undefined,
		).toThrow();
	});

	it("carries a strict result codec for each method", async () => {
		const testCase = composition();
		await registered(testCase);
		const descriptor = testCase.root.typert.local.get("memlens/view");
		expect(descriptor?.result.mode).toBe("strict");
		if (descriptor?.result.mode !== "strict")
			throw new Error("The view result codec is not strict.");
		const encode = descriptor.result.encode;
		expect(encode).toBeTypeOf("function");
		expect(() => encode?.({ bogus: true }, () => null)).toThrow();
	});

	it("refuses a session that the host does not hold", async () => {
		const testCase = composition();
		await registered(testCase);
		const unknown = await failure(
			call(testCase, "view", { session: "session-missing" }),
		);
		expect(unknown.code).toBe("gateway/bad-request");
		expect(unknown.message).toBe("The session is unknown.");
	});

	it("reads the default profile when the request names no session", async () => {
		const testCase = composition();
		await registered(testCase);
		const answer = (await direct(testCase, "view", {})) as {
			readonly profile: string;
			readonly profiles: readonly string[];
		};
		expect(answer.profile).toBe("default");
		expect(answer.profiles).toEqual(["default"]);
	});

	it("resolves the profile and the scope from the session, not from the request", async () => {
		const testCase = composition({
			base: CASE_BASE.replace('scopes = ["*"]', 'scopes = ["user:notes"]'),
		});
		await registered(testCase);
		const view = await call(testCase, "view", {
			session: testCase.agent.id,
			profile: "another",
			scope: "user:notes",
		});
		expect(view.profile).toBe("default");
		expect(view.profiles).toEqual(["default"]);
		const fallback = await call(testCase, "view", {
			session: testCase.agent.id,
		});
		expect(fallback.scope).toBe("user:notes");
		const outside = await failure(
			call(testCase, "view", {
				session: testCase.agent.id,
				scope: "project:other",
			}),
		);
		expect(outside.code).toBe("gateway/bad-request");
		expect(outside.message).toMatch(/outside this profile/);
		const invalid = await failure(
			call(testCase, "view", { session: testCase.agent.id, scope: "Bad Key" }),
		);
		expect(invalid.message).toMatch(/invalid/);
	});
});

describe("console profile surface", () => {
	const twoProfiles = CASE_BASE.replace(
		"[profile.default.budget]",
		'[profile.work]\nscopes = ["project:*"]\n\n[profile.default.budget]',
	);

	it("reads one named profile with no session and lists each profile", async () => {
		const testCase = composition({ base: twoProfiles });
		await registered(testCase);
		const view = await call(testCase, "view", { profile: "work" });
		expect(view.profile).toBe("work");
		expect(view.profiles).toEqual(["default", "work"]);
		expect(view.scope).toBe("user:notes");
	});

	it("resolves the scope of the profile, not of a session", async () => {
		const testCase = composition({ base: twoProfiles });
		await registered(testCase);
		const fallback = await call(testCase, "view", { profile: "work" });
		expect(fallback.scope).toBe("user:notes");
		const outside = await failure(
			call(testCase, "view", { profile: "work", scope: "user:other" }),
		);
		expect(outside.code).toBe("gateway/bad-request");
		expect(outside.message).toMatch(/outside this profile/);
	});

	it("answers a profile that the base file does not name", async () => {
		const testCase = composition();
		await registered(testCase);
		const view = await call(testCase, "view", { profile: "nope" });
		expect(view.profile).toBe("nope");
		expect(view.scope).toBe("user:notes");
		expect(view.profiles).toEqual(["default"]);
	});

	it("answers a base file that names no profile at all", async () => {
		const bare =
			'language = "en"\ndefaultProfile = "default"\n\n' +
			'[scope_default]\nrules = []\ndefault = "user:notes"\n';
		const testCase = composition({ base: bare });
		await registered(testCase);
		const view = await call(testCase, "view", {});
		expect(view.profile).toBe("default");
		expect(view.profiles).toEqual(["default"]);
		expect(view.scope).toBe("user:notes");
		expect(view.scopes.map((scope) => scope.key)).toContain("user:notes");
	});

	it("writes a note through a profile and reads it back", async () => {
		const testCase = composition({ base: twoProfiles });
		await registered(testCase);
		const saved = await call(testCase, "action", {
			profile: "work",
			action: "note",
			scope: "user:notes",
			body: "a profile record",
		});
		expect("id" in saved ? saved.id : undefined).toBeTypeOf("string");
		const view = await call(testCase, "view", { profile: "work" });
		expect(view.records).toHaveLength(1);
	});

	it("answers the compaction state of a profile with no snapshot", async () => {
		const testCase = composition();
		await registered(testCase);
		const answer = (await direct(testCase, "status", {
			profile: "default",
		})) as {
			readonly session?: string;
			readonly snapshot?: unknown;
			readonly scope: string;
			readonly compaction: { readonly attempts: number };
		};
		expect(answer.session).toBeUndefined();
		expect(answer.snapshot).toBeUndefined();
		expect(answer.scope).toBe("user:notes");
		expect(answer.compaction.attempts).toBe(0);
	});
});

describe("console reads", () => {
	it("answers the view with the model, the proposals, and the policy", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		await registered(testCase);
		const view = await call(testCase, "view", { session: testCase.agent.id });
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
	});

	it("answers search with the hits and the limit rule", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta gamma", 1);
		await registered(testCase);
		const found = await call(testCase, "search", {
			session: testCase.agent.id,
			q: "alpha",
		});
		expect(Array.isArray(found)).toBe(true);
		expect(found[0]?.scope).toBe("user:notes");
		expect(found[0]?.pos).toBe(0);
		const alias = await call(testCase, "search", {
			session: testCase.agent.id,
			query: "alpha",
		});
		expect(alias).toHaveLength(found.length);
		const badLimit = await failure(
			call(testCase, "search", {
				session: testCase.agent.id,
				q: "alpha",
				limit: "many",
			}),
		);
		expect(badLimit.code).toBe("gateway/bad-request");
		expect(badLimit.message).toMatch(/limit/);
	});

	it("answers open with a note, a range, and an offset", async () => {
		const testCase = composition();
		insert(testCase, `${"long body ".repeat(20)}one`, 1);
		insert(testCase, `${"long body ".repeat(20)}two`, 2);
		await registered(testCase);
		const entry = await call(testCase, "open", {
			session: testCase.agent.id,
			target: "user:notes#0",
		});
		expect(entry.kind).toBe("entry");
		if (entry.kind !== "entry") throw new Error("The open answer is no entry.");
		expect(entry.pos).toBe(0);
		expect(entry.scope).toBe("user:notes");
		expect(entry.longformChars).toBeTypeOf("number");
		const offset = await call(testCase, "open", {
			session: testCase.agent.id,
			target: "0",
			offset: "10",
		});
		if (offset.kind !== "entry")
			throw new Error("The open answer is no entry.");
		expect(offset.longformOffset).toBeGreaterThanOrEqual(10);
		const children = await call(testCase, "open", {
			session: testCase.agent.id,
			target: "#0-1",
		});
		expect(children.kind).toBe("children");
		if (children.kind !== "children")
			throw new Error("The open answer is no children list.");
		expect(Array.isArray(children.children)).toBe(true);
		const missing = await failure(
			call(testCase, "open", { session: testCase.agent.id, target: "9" }),
		);
		expect(missing.message).toMatch(/does not exist/);
		const badTarget = await failure(
			call(testCase, "open", {
				session: testCase.agent.id,
				target: "not an address",
			}),
		);
		expect(badTarget.code).toBe("gateway/bad-request");
		const badOffset = await failure(
			call(testCase, "open", {
				session: testCase.agent.id,
				target: "0",
				offset: "half",
			}),
		);
		expect(badOffset.code).toBe("gateway/bad-request");
	});

	it("answers catalog with one level and the budget alias", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const lines = await call(testCase, "catalog", {
			session: testCase.agent.id,
			start: "0",
			level: "1",
		});
		expect(Array.isArray(lines)).toBe(true);
		const alias = await call(testCase, "catalog", {
			session: testCase.agent.id,
			start: "0",
			budget: "1",
		});
		expect(alias).toEqual(lines);
		const bad = await failure(
			call(testCase, "catalog", {
				session: testCase.agent.id,
				start: "0",
				level: "0",
			}),
		);
		expect(bad.message).toMatch(/range/);
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
		const saved = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "note",
			scope: "user:notes",
			body: "first record",
		});
		expect("id" in saved ? saved.id : undefined).toBeTypeOf("string");
		const duplicate = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "note",
			scope: "user:notes",
			body: "first record",
		});
		expect(duplicate).toEqual({ duplicate: true });
		const two = await call(testCase, "view", { session: testCase.agent.id });
		expect(two.records).toHaveLength(1);
	});

	it("amends, reviews, hides, and deletes one note", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const amended = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "amend",
			target: "user:notes#0",
			dest: "user:notes",
			body: "changed body",
			kind: "fact",
		});
		expect(amended).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.body).toBe(
			"changed body",
		);
		const reviewed = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "review",
			target: "0",
		});
		expect(reviewed).toEqual({ ok: true });
		const forgotten = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "forget",
			target: "1",
		});
		expect(forgotten).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 1)?.state).toBe(
			"hidden",
		);
		const refused = await failure(
			call(testCase, "action", {
				session: testCase.agent.id,
				action: "delete",
				target: "0",
			}),
		);
		expect(refused.code).toBe("gateway/bad-request");
		expect(refused.message).toMatch(/confirmation/);
		const deleted = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "delete",
			target: "0",
			confirm: true,
		});
		expect(deleted).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.state).toBe(
			"deleted",
		);
		const unknown = await failure(
			direct(testCase, "action", {
				session: testCase.agent.id,
				action: "shout",
				target: "0",
			}),
		);
		expect(unknown.code).toBe("gateway/bad-request");
		expect(unknown.message).toMatch(/unknown/);
		const rejected = await failure(
			call(testCase, "action", {
				session: testCase.agent.id,
				action: "shout",
				target: "0",
			}),
		);
		expect(rejected.message).toMatch(/action/);
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
		const moved = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "amend",
			target: "user:notes#0",
			dest: "project:moved",
			body: "alpha beta",
			kind: "decision",
		});
		expect(moved).toEqual({ ok: true });
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
		const accept = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "accept",
			target: accepted.id,
		});
		expect(accept).toEqual({ ok: true });
		expect(byAddress(testCase.memlens.store, "user:notes", 0)?.state).toBe(
			"hidden",
		);
		const stale = await failure(
			call(testCase, "action", {
				session: testCase.agent.id,
				action: "accept",
				target: accepted.id,
			}),
		);
		expect(stale.code).toBe("gateway/bad-request");
		expect(stale.message).toMatch(/no longer pending/);
		const dismissed = propose(testCase.memlens.store, {
			scope: "user:notes",
			op: "review",
			target: row.id,
			payload: { review_at: null },
		});
		const dismiss = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "dismiss",
			target: dismissed.id,
		});
		expect(dismiss).toEqual({ ok: true });
	});

	it("forgets or deletes one scope with confirmation", async () => {
		const testCase = composition();
		insert(testCase, "alpha beta", 1);
		insert(testCase, "gamma delta", 2);
		await registered(testCase);
		const refused = await failure(
			call(testCase, "action", {
				session: testCase.agent.id,
				action: "scope-delete",
				scope: "user:notes",
			}),
		);
		expect(refused.code).toBe("gateway/bad-request");
		const hidden = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "scope-forget",
			scope: "user:notes",
			confirm: true,
		});
		expect(hidden).toEqual({ changed: 2 });
		const deleted = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "scope-delete",
			scope: "user:notes",
			confirm: true,
		});
		expect(deleted).toEqual({ changed: 2 });
	});

	it("prepares a compaction job and applies its answer", async () => {
		const testCase = composition();
		insert(testCase, `${"long body ".repeat(40)}one`, 1);
		insert(testCase, `${"long body ".repeat(40)}two`, 2);
		await registered(testCase);
		const job = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "compact",
			scope: "user:notes",
		});
		if (!("job" in job)) throw new Error("The answer holds no job.");
		expect(job.inputs).toHaveLength(1);
		expect(job.job).toContain("#0-1");
		expect(job.copies).toBeTypeOf("number");
		expect(job.joins).toBeTypeOf("number");
		const applied = await call(testCase, "action", {
			session: testCase.agent.id,
			action: "compact-answer",
			scope: "user:notes",
			answers: "#0-1: merged line",
			inputs: job.inputs,
		});
		if (!("built" in applied)) throw new Error("The answer holds no count.");
		expect(applied.built).toBe(1);
		expect(applied.rejected).toBe(0);
		expect(applied.rejectedRanges).toEqual([]);
		const missing = await failure(
			call(testCase, "action", {
				session: testCase.agent.id,
				action: "compact-answer",
				scope: "user:notes",
				answers: "#0-1: x",
			}),
		);
		expect(missing.message).toMatch(/copied inputs/);
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
		const answer = await call(testCase, "status", {
			session: testCase.agent.id,
		});
		expect(answer.session).toBe(testCase.agent.id);
		expect(answer.scope).toBe("user:notes");
		expect(snapshotOf(answer).saved).toBe(false);
		expect(snapshotOf(answer).materializedAt).toBe(toIso(1_000));
		expect(snapshotOf(answer).nextTrigger).toBe("idle");
		const ttl = ttlSeconds(
			testCase.memlens.forAgent(testCase.agent).config.cacheTtl,
			"test/large",
		);
		expect(snapshotOf(answer).nextRefreshAt).toBe(toIso(1_000 + ttl * 1000));
		expect(answer.compaction).toMatchObject({
			attempts: 0,
			active: 0,
			backoff: 0,
			failures: 0,
			dirty: 0,
			lastRunAt: null,
			lastError: null,
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
		const answer = await call(testCase, "status", {
			session: testCase.agent.id,
		});
		expect(snapshotOf(answer).saved).toBe(true);
		expect(snapshotOf(answer).chars).toBe("memory slice".length);
		expect(snapshotOf(answer).materializedAt).toBe(null);
		expect(snapshotOf(answer).nextRefreshAt).toBe(null);
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
