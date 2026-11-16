/**
 * #region moduleContract
 * @purpose Prove that the console Remote contract holds one strict schema for each input and
 *   result, that the descriptors of both faces come from the one table, and that the result
 *   schemas accept the real answer of each console operation.
 * @scope The descriptor fields, the strict input rejection, the client payloads, and the real
 *   answers of the read, action, and status operations.
 * @invariants Tests use a temporary XDG root and a temporary store per case, and clean them up.
 * @invariants No test opens a socket and no test makes a paid call.
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { debuglog } from "node:util";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createScope } from "@deepseek-ai/dsh-scope";
import type { TypertCodec } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { note } from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionRoute } from "../src/console/action.js";
import {
	catalogAnswer,
	openAnswer,
	searchAnswer,
	viewAnswer,
} from "../src/console/read.js";
import {
	CONSOLE_METHODS,
	CONSOLE_NAMESPACE,
	CONSOLE_PACKAGE,
	CONSOLE_SERVICE,
	type ConsoleInputs,
	type ConsoleMethod,
	type ConsoleResults,
	consoleContribution,
	consoleDescriptors,
	consoleResultSchemas,
	consoleSchemaFactories,
	consoleSchemas,
} from "../src/console/remote-contract.js";
import { type ConsoleRequest, requestScope } from "../src/console/scope.js";
import { statusAnswer } from "../src/console/status.js";
import { Memlens } from "../src/service.js";
import type { MemoryWorker } from "../src/worker.js";

const debug = debuglog("memlens:plugin:remote-contract:test");

/** The roots of the running case. */
const roots: Context[] = [];

/** The temporary directories of the running case. */
const directories: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await root.fiber.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

/** The payloads that the client port sends, one for each method. */
const CLIENT_INPUTS: ConsoleInputs = {
	view: { session: "s", profile: "default", scope: "user:notes", kind: "" },
	search: {
		session: "s",
		profile: "default",
		scope: "",
		query: "tab",
		kind: "",
		since: "",
		limit: "10",
	},
	open: {
		session: "s",
		profile: "default",
		scope: "user:notes",
		target: "user:notes#0",
	},
	catalog: {
		session: "s",
		profile: "default",
		scope: "user:notes",
		start: "0",
		level: "1",
	},
	status: { session: "s" },
	action: {
		session: "s",
		profile: "default",
		scope: "user:notes",
		action: "compact",
	},
};

// #region FUNC_subject
/** @purpose Create one agent subject with a real scoped context and a controlled route. */
function subject(root: Context): Agent {
	const agent = {} as Agent;
	const scope = createScope(root, agent);
	Object.assign(agent, {
		id: "session-contract",
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

// #region FUNC_composition
/**
 * @purpose Start the real host service under a temporary configuration root, and give one
 *   resolved console request.
 * @invariants The store holds one note in the active scope of the session.
 */
function composition(): {
	readonly request: ConsoleRequest;
	readonly root: Context;
} {
	const directory = mkdtempSync(join(tmpdir(), "memlens-remote-contract-"));
	directories.push(directory);
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	const root = new Context();
	roots.push(root);
	const memlens = new Memlens(root, {});
	const agent = subject(root);
	const memory = memlens.forAgent(agent);
	const scope = requestScope(memory, "");
	note(memory.store, {
		scope,
		kind: "note",
		body: "The tab shows the console of the session.",
		session: "session-test",
		turn: "turn-test",
		preset: "default",
		ts: "2026-01-01T00:00:00.000Z",
	});
	debug("Case start", { event: "start", directory, scope });
	return {
		request: { agent, memory, scope, fields: {}, profiles: ["default"] },
		root,
	};
}
// #endregion FUNC_composition

describe("console scope of a profile request", () => {
	it("opens on the scope of the newest note and keeps the active scope otherwise", () => {
		const { request } = composition();
		const memory = request.memory;
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
			note(memory.store, {
				scope: "project:alpha",
				kind: "note",
				body: "The older scope.",
				session: "s",
				turn: "t",
				preset: "p",
				ts: "2030-01-01T00:00:00.000Z",
			});
			vi.setSystemTime(new Date("2030-01-02T00:00:00.000Z"));
			note(memory.store, {
				scope: "project:beta",
				kind: "note",
				body: "The newer scope.",
				session: "s",
				turn: "t",
				preset: "p",
				ts: "2030-01-02T00:00:00.000Z",
			});
		} finally {
			vi.useRealTimers();
		}
		expect(requestScope(memory, "", true)).toBe("project:beta");
		expect(requestScope(memory, "", false)).toBe(memory.scope);
	});

	it("keeps a requested scope", () => {
		const { request } = composition();
		expect(requestScope(request.memory, "user:notes", true)).toBe("user:notes");
	});
});

/** The worker state that the status answer reads. */
const worker = {
	status: () => ({
		attempts: 0,
		active: 0,
		backoff: 0,
		failures: 0,
		dirty: 1,
		provider: "test",
		model: "merge-model",
		lastRunAt: null,
		nextRunAt: null,
		lastError: null,
		events: [],
	}),
} as unknown as MemoryWorker;

/** Narrow one codec to its strict form, so a test reads the parser. */
function strictCodec(
	codec: TypertCodec | undefined,
): Extract<TypertCodec, { mode: "strict" }> {
	if (codec?.mode !== "strict") throw new Error("The codec is not strict.");
	return codec;
}

/** One descriptor by its method name. */
function descriptorOf(method: ConsoleMethod) {
	const found = consoleDescriptors().find((item) => item.method === method);
	if (found === undefined)
		throw new Error(`The descriptor of ${method} is absent.`);
	return found;
}

describe("console Remote descriptors", () => {
	it("gives one direct descriptor for each method with the shared identity", () => {
		const descriptors = consoleDescriptors();
		expect(descriptors).toHaveLength(CONSOLE_METHODS.length);
		expect(descriptors.map((item) => item.method)).toEqual([
			...CONSOLE_METHODS,
		]);
		for (const descriptor of descriptors) {
			expect(descriptor.id).toBe(
				`${CONSOLE_PACKAGE}#${CONSOLE_NAMESPACE}/${descriptor.method}`,
			);
			expect(descriptor.service).toBe(CONSOLE_SERVICE);
			expect(descriptor.service).not.toBe("memlens");
			expect(descriptor.namespace).toBe("memlens");
			expect(descriptor.invocation).toEqual({ kind: "direct" });
			expect(descriptor.parameters).toHaveLength(1);
			const [parameter] = descriptor.parameters;
			expect(parameter?.name).toBe("input");
			expect(parameter?.wire).toBe("input");
			expect(parameter?.source).toBe("json");
			expect(parameter?.codec.mode).toBe("strict");
			expect(typeof strictCodec(parameter?.codec).create).toBe("function");
			const result = strictCodec(descriptor.result);
			expect(typeof result.create).toBe("function");
			expect(typeof result.decode).toBe("function");
			expect(typeof result.encode).toBe("function");
		}
	});

	it("gives the client the same descriptors as the one table", () => {
		const contribution = consoleContribution();
		expect(contribution.package).toBe(CONSOLE_PACKAGE);
		const identity = (descriptors: typeof contribution.descriptors): unknown =>
			descriptors.map((descriptor) => ({
				id: descriptor.id,
				service: descriptor.service,
				namespace: descriptor.namespace,
				method: descriptor.method,
				parameters: descriptor.parameters.map((parameter) => ({
					name: parameter.name,
					wire: parameter.wire,
					source: parameter.source,
					typeSymbol: strictCodec(parameter.codec).typeSymbol,
				})),
				result: strictCodec(descriptor.result).typeSymbol,
			}));
		expect(identity(contribution.descriptors)).toEqual(
			identity(consoleDescriptors()),
		);
	});

	it("gives one schema factory for each input and each result", () => {
		const names = consoleSchemaFactories().map((factory) => factory.name);
		expect(names).toEqual(
			CONSOLE_METHODS.flatMap((method) => [
				`console.${method}.input`,
				`console.${method}.result`,
			]),
		);
		for (const factory of consoleSchemaFactories())
			expect(typeof factory.create().parse).toBe("function");
	});
});

describe("console Remote registration", () => {
	it("registers into the real registry and withdraws its namespace", async () => {
		const root = new Context();
		roots.push(root);
		new TypertRegistry(root);
		const dispose = root.typert.register({
			package: CONSOLE_PACKAGE,
			face: "host",
			schemas: consoleSchemaFactories(),
			model: { services: [], events: [], objects: [] },
			invocations: consoleDescriptors(),
		});
		const registered = root.typert.local.get("memlens/view");
		expect(registered?.id).toBe(`${CONSOLE_PACKAGE}#memlens/view`);
		expect(registered?.service).toBe(CONSOLE_SERVICE);
		const codec = strictCodec(registered?.parameters[0]?.codec);
		expect(() => codec.create().parse({ session: "s", extra: 1 })).toThrow();
		expect(codec.create().parse({ session: "s" })).toStrictEqual({
			session: "s",
		});
		expect(
			root.typert.get(`${CONSOLE_PACKAGE}#console.view.input`),
		).toBeDefined();
		await dispose();
		expect(root.typert.local.get("memlens/view")).toBeUndefined();
		await root.fiber.dispose();
		roots.splice(roots.indexOf(root), 1);
	});
});

describe("console Remote input schemas", () => {
	it("accepts the payload of each client method", () => {
		for (const method of CONSOLE_METHODS) {
			const parsed = consoleSchemas[method].parse(CLIENT_INPUTS[method]);
			expect(parsed).toEqual(CLIENT_INPUTS[method]);
			expect(consoleSchemas[method]).toBe(
				strictCodec(descriptorOf(method).parameters[0]?.codec).create(),
			);
		}
	});

	it("rejects an unknown field of each input through the descriptor codec", () => {
		for (const method of CONSOLE_METHODS) {
			const schema = strictCodec(
				descriptorOf(method).parameters[0]?.codec,
			).create();
			expect(() =>
				schema.parse({ ...CLIENT_INPUTS[method], unknown_field: true }),
			).toThrow();
		}
	});

	it("takes the session id or the profile name of each input", () => {
		for (const method of CONSOLE_METHODS) {
			const { session: _session, ...rest } = CLIENT_INPUTS[method] as Record<
				string,
				unknown
			>;
			expect(consoleSchemas[method].parse(rest)).toBeTruthy();
			expect(
				consoleSchemas[method].parse({ ...rest, profile: "work" }),
			).toBeTruthy();
		}
	});

	it("keeps the action payload strict for each action name", () => {
		expect(
			consoleSchemas.action.parse({
				session: "s",
				action: "amend",
				target: "user:notes#0",
				dest: "user:notes",
			}),
		).toMatchObject({ action: "amend" });
		expect(() =>
			consoleSchemas.action.parse({ session: "s", action: "unknown" }),
		).toThrow();
		expect(() =>
			consoleSchemas.action.parse({ session: "s", action: "note", extra: 1 }),
		).toThrow();
	});
});

describe("console Remote result schemas", () => {
	it("accepts the real answer of each console operation", async () => {
		const { request } = composition();
		const fields = { ...request.fields };
		const answers: Record<ConsoleMethod, unknown> = {
			view: await viewAnswer({ ...request, fields: { ...fields, kind: "" } }),
			search: searchAnswer({
				...request,
				fields: { ...fields, query: "console" },
			}),
			open: openAnswer({
				...request,
				fields: { ...fields, target: `${request.scope}#0` },
			}),
			catalog: await catalogAnswer({
				...request,
				fields: { ...fields, start: "0", level: "1" },
			}),
			status: statusAnswer(request, worker),
			action: await actionRoute({
				...request,
				fields: { ...fields, action: "compact" },
			}),
		};
		for (const method of CONSOLE_METHODS) {
			const schema = consoleResultSchemas[method];
			expect(() => schema.parse(answers[method])).not.toThrow();
			expect(schema.parse(answers[method])).toEqual(answers[method]);
			debug("Answer parsed", { event: "result", method });
		}
		const saved = await actionRoute({
			...request,
			fields: { ...fields, action: "note", body: "One more note." },
		});
		expect(saved).toMatchObject({ id: expect.any(String) });
		expect(consoleResultSchemas.action.parse(saved)).toEqual(saved);
	});

	it("rejects a result of a drifted shape", () => {
		const view = consoleResultSchemas.view;
		expect(() => view.parse({ profile: "default" })).toThrow();
		expect(() =>
			consoleResultSchemas.action.parse({ id: "x", unknown_field: 1 }),
		).toThrow();
	});

	it("types the input and the result of each method", () => {
		const sample: ConsoleResults["status"] = statusAnswer(
			composition().request,
			worker,
		);
		expect(sample.snapshot?.nextTrigger).toBe("idle");
	});
});
