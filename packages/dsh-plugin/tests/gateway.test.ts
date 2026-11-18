/**
 * #region moduleContract
 * @purpose Prove the console Remote over the real Typert Gateway and the real access policy, so a
 *   caller cannot reach the console with a bad input, another principal, or after disposal.
 * @scope The gateway dispatch of one read and one action, the malformed input, the unauthorized
 *   principal, and the disposer.
 *  - NOT: the read rules, the action rules, the client mount, and the Web transport.
 * @invariants Tests use the real Typert registry, the real Gateway service, the real access policy,
 *   the real plugin service, and a temporary store.
 * @invariants Tests use the owner principal for the allowed calls and a non-owner principal without
 *   a policy for the refused call.
 * @invariants Tests use a stub LLM. No test opens a socket and no test makes a paid call.
 * @dependencies USES API: @deepseek-ai/cordis, @deepseek-ai/dsh-api-gateway,
 *   @deepseek-ai/dsh-api-remote-access, @deepseek-ai/dsh-typert-protocol,
 *   @deepseek-ai/dsh-typert-registry, @deepseek-ai/dsh-agent, @deepseek-ai/dsh-llm,
 *   @deepseek-ai/dsh-scope, @memlens/core, ../src/service.ts, ../src/worker.ts,
 *   ../src/console/remote.ts, ../src/console/remote-contract.ts
 * @keywords gateway, remote, access, principal, denial, input, disposal, console
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { debuglog } from "node:util";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import { RemoteAccessService } from "@deepseek-ai/dsh-api-remote-access";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { createScope } from "@deepseek-ai/dsh-scope";
import type { PeerScope, Principal } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import type { CompactionConfig, StoreConfig } from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerConsoleRemote } from "../src/console/remote.js";
import {
	CONSOLE_NAMESPACE,
	CONSOLE_SERVICE,
} from "../src/console/remote-contract.js";
import type { StatusAnswer } from "../src/console/status.js";
import { Memlens } from "../src/service.js";
import { MemoryWorker, type WorkerLlm } from "../src/worker.js";

const debug = debuglog("memlens:plugin:gateway:test");

/** The owner principal of this Host. */
const owner = { kind: "owner" } as const;

/** A caller identity without an access policy. */
const stranger = { kind: "stranger" } as unknown as Principal;

/** The roots and the temporary directories of the running case. */
const roots: Context[] = [];

/** The temporary directories of the running case. */
const directories: string[] = [];

/** The next session number of the running case. */
let nextSession = 0;

afterEach(async () => {
	for (const root of roots.splice(0)) await root.fiber.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// #region CLASS_StubLlm
/** @purpose Answer one merge call with a scripted text. */
class StubLlm implements WorkerLlm {
	stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
		return (async function* (): AsyncGenerator<StreamChunk> {
			yield { type: "text-delta", index: 0, text: "one line summary" };
			yield { type: "finish", reason: { kind: "stop" } };
		})();
	}
}
// #endregion CLASS_StubLlm

// #region INTERFACE_Case
/** One running gateway case. */
interface Case {
	readonly root: Context;
	readonly memlens: Memlens;
	readonly worker?: MemoryWorker | undefined;
	readonly agent: Agent;
}
// #endregion INTERFACE_Case

/** The base file of a profile whose scopes match no active scope. */
const GLOB_ONLY_BASE = `defaultProfile = "glob"

[profile.glob]
scopes = ["project:*"]

[profile.glob.budget]
here = 20
directions = 10

[store]
idle = 300

[compaction]
provider = "test"
model = "merge-model"

[scope_default]
default = "user:notes"
`;

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
} {
	return {
		compaction: {
			provider: "test",
			model: "merge-model",
			effort: "",
			batch: 1,
			maxCallsPerHour: 60,
		},
		store: { path: "unused", idle: 300 },
	};
}

// #region FUNC_composition
/**
 * @purpose Start the real registry, the real access policy, and the real Gateway under a temporary
 *   configuration root.
 * @invariants The Gateway starts after the two services that it injects.
 */
function composition(options: { store?: string; base?: string } = {}): Case {
	const directory = mkdtempSync(join(tmpdir(), "memlens-gateway-"));
	directories.push(directory);
	if (options.base !== undefined) {
		mkdirSync(join(directory, "memlens"), { recursive: true });
		writeFileSync(join(directory, "memlens", "config.toml"), options.base);
	}
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", options.store);
	const root = new Context();
	roots.push(root);
	const memlens = new Memlens(root, {});
	const agent = subject(root);
	root.provide("agents", {
		get: (id: string) => (id === agent.id ? agent : undefined),
	} as unknown as Context["agents"]);
	new TypertRegistry(root);
	new RemoteAccessService(root);
	new TypertGatewayService(root, {
		websocketHeartbeatIntervalMs: 2000,
		streamInboxBytes: 262_144,
		websocketCompression: "none",
	});
	const worker = memlens.storeState().ready
		? new MemoryWorker(root, memlens.store, workerInputs(), new StubLlm())
		: undefined;
	debug("Case start", { event: "start", directory, session: agent.id });
	return { root, memlens, worker, agent };
}
// #endregion FUNC_composition

// #region FUNC_registered
/**
 * @purpose Register the console Remote and wait until its fiber starts.
 * @param testCase - The running gateway case.
 */
async function registered(testCase: Case): Promise<() => Promise<void>> {
	const dispose = registerConsoleRemote(
		testCase.root,
		testCase.memlens,
		() => testCase.worker,
	);
	await new Promise((resolve) => setImmediate(resolve));
	return dispose;
}
// #endregion FUNC_registered

// #region FUNC_peer
/** @purpose Name one Peer of this Host with a fixed principal and a live signal. */
function peer(root: Context, principal: Principal): PeerScope {
	return {
		id: "peer-gateway-test" as PeerScope["id"],
		ctx: root,
		principal,
		signal: new AbortController().signal,
		interactions: "none",
		dispose: async () => {},
	};
}
// #endregion FUNC_peer

// #region FUNC_call
/**
 * @purpose Send one call through the real Gateway, as a carrier adapter does.
 * @param testCase - The running gateway case.
 * @param method - The console method of the call.
 * @param args - The exact wire arguments of the call.
 * @param principal - The caller identity; the owner by default.
 */
function call(
	testCase: Case,
	method: string,
	args: Readonly<Record<string, unknown>>,
	principal: Principal = owner,
): Promise<unknown> {
	return testCase.root.typertGateway.invoke({
		namespace: CONSOLE_NAMESPACE,
		method,
		args,
		peer: peer(testCase.root, principal),
	});
}
// #endregion FUNC_call

// #region FUNC_failure
/**
 * @purpose Give the code and the message of one failed call.
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

/** @purpose Name the records of one view answer. */
interface ViewAnswer {
	readonly profile: string;
	readonly revision: string;
	readonly records: readonly { readonly body: string }[];
}

describe("console Remote over the real gateway", () => {
	it("answers a valid read through the registry, the gateway, and the access policy", async () => {
		const testCase = composition();
		await registered(testCase);
		expect(testCase.root.typert.local.get("memlens/view")?.service).toBe(
			CONSOLE_SERVICE,
		);
		const answer = (await call(testCase, "view", {
			input: { session: testCase.agent.id },
		})) as ViewAnswer;
		expect(answer.profile).toBeTypeOf("string");
		expect(answer.revision).toBeTypeOf("string");
		expect(answer.records).toEqual([]);
	});

	it("answers the store state of a session and a profile with no scope requested", async () => {
		const directory = mkdtempSync(join(tmpdir(), "memlens-gateway-blocked-"));
		directories.push(directory);
		const blocker = join(directory, "blocker");
		writeFileSync(blocker, "not a directory");
		const testCase = composition({ store: join(blocker, "store") });
		await registered(testCase);
		const session = (await call(testCase, "status", {
			input: { session: testCase.agent.id },
		})) as StatusAnswer;
		expect(session.store?.ready).toBe(false);
		expect(session.store?.error).toMatch(/not a directory|ENOTDIR/);
		expect(session.compaction).toBeUndefined();
		const profile = (await call(testCase, "status", {
			input: {},
		})) as StatusAnswer;
		expect(profile.store?.ready).toBe(false);
		expect(profile.compaction).toBeUndefined();
		const failed = await failure(call(testCase, "view", { input: {} }));
		expect(failed.code).toBe("gateway/bad-request");
		expect(failed.message).toMatch(/not open/);
	});

	it("states the store of a profile whose scopes match no active scope", async () => {
		const directory = mkdtempSync(join(tmpdir(), "memlens-gateway-glob-"));
		directories.push(directory);
		const blocker = join(directory, "blocker");
		writeFileSync(blocker, "not a directory");
		const testCase = composition({
			base: GLOB_ONLY_BASE,
			store: join(blocker, "store"),
		});
		await registered(testCase);
		const profile = (await call(testCase, "status", {
			input: {},
		})) as StatusAnswer;
		expect(profile.store?.ready).toBe(false);
		expect(profile.scope).toBeTypeOf("string");
		const session = (await call(testCase, "status", {
			input: { session: testCase.agent.id },
		})) as StatusAnswer;
		expect(session.store?.ready).toBe(false);
		expect(session.scope).toBeTypeOf("string");
	});
	it("applies a valid action and reads its record through the gateway", async () => {
		const testCase = composition();
		await registered(testCase);
		const body = "A note from the real gateway";
		const saved = (await call(testCase, "action", {
			input: { session: testCase.agent.id, action: "note", body },
		})) as { id?: string; duplicate?: true };
		expect(saved.id).toBeTypeOf("string");
		const answer = (await call(testCase, "view", {
			input: { session: testCase.agent.id },
		})) as ViewAnswer;
		expect(answer.records.map((record) => record.body)).toContain(body);
	});

	it("rejects a malformed input before the service runs", async () => {
		const testCase = composition();
		await registered(testCase);
		const unknown = await failure(
			call(testCase, "view", {
				input: { session: testCase.agent.id, bogus: 1 },
			}),
		);
		expect(unknown.code).toBe("gateway/input-invalid");
		const absent = await failure(call(testCase, "view", {}));
		expect(absent.code).toBe("gateway/arguments-invalid");
		const extra = await failure(
			call(testCase, "view", {
				input: { session: testCase.agent.id },
				extra: true,
			}),
		);
		expect(extra.code).toBe("gateway/arguments-invalid");
	});

	it("denies an unauthorized principal and changes no record", async () => {
		const testCase = composition();
		await registered(testCase);
		const denied = await failure(
			call(
				testCase,
				"action",
				{
					input: { session: testCase.agent.id, action: "note", body: "denied" },
				},
				stranger,
			),
		);
		expect(denied.code).toBe("remote-access/denied");
		expect(denied.message).toContain("access denied (no-allow)");
		const answer = (await call(testCase, "view", {
			input: { session: testCase.agent.id },
		})) as ViewAnswer;
		expect(answer.records).toEqual([]);
	});

	it("removes the endpoints, the service, and the dispatch with its disposer", async () => {
		const testCase = composition();
		const dispose = await registered(testCase);
		expect(testCase.root.typert.local.list()).toHaveLength(6);
		await dispose();
		expect(testCase.root.typert.local.list()).toEqual([]);
		expect(testCase.root.get(CONSOLE_SERVICE)).toBeUndefined();
		const after = await failure(
			call(testCase, "view", {
				input: { session: testCase.agent.id },
			}),
		);
		expect(after.code).toBe("gateway/definition-unavailable");
	});
});
