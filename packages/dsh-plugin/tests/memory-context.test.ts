/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the memory context holds one snapshot for each agent and refreshes it only at
 * the accepted triggers.
 * @scope The real Cordis context, the real system-prompt service, the real store, the restore from
 * the session history, the compaction trigger, the idle timer, and the subagent mode.
 * @invariants The fixtures write rows through the core write path.
 * @invariants The fake session supplies the derived history only. The harness owns the real log.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @deepseek-ai/dsh-system-prompt,
 * @memlens/core, ../src/memory-context.ts, ../src/service.ts
 * @keywords test, context, snapshot, restore, compaction, idle, ttl, subagent
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
	bindScopeParent,
	createScope,
	type ScopeKey as RegistrationScope,
} from "@deepseek-ai/dsh-scope";
import {
	renderContextSections,
	SystemPrompt,
} from "@deepseek-ai/dsh-system-prompt";
import { note, type Store } from "@memlens/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMemoryContext } from "../src/memory-context.js";
import { Memlens } from "../src/service.js";

const BASE_CONFIG = `language = "en"
defaultProfile = "a"

[profile.a]
scopes = ["*"]

[profile.a.budget]
here = 20
directions = 10

[profile.child]
scopes = ["*"]
subagents = "off"

[profile.child.budget]
here = 20
directions = 10

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"

[scope_default]
default = "user:notes"

[[scope_default.rules]]
match = "path"
glob = "*/alpha"
key = "project:alpha"

[[scope_default.rules]]
match = "path"
glob = "*/beta"
key = "project:beta"
`;

/** The TTL of each test route, in seconds. The glob `*` matches the test route `test/route`. */
const TTL_SECONDS = 1;

const savedEnv = { ...process.env };

let rootDir: string;

let cwdAlpha: string;

let cwdBeta: string;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), "memlens-context-"));
	cwdAlpha = join(rootDir, "alpha");
	cwdBeta = join(rootDir, "beta");
	mkdirSync(cwdAlpha, { recursive: true });
	mkdirSync(cwdBeta, { recursive: true });
	const configDir = join(rootDir, "config");
	mkdirSync(join(configDir, "memlens"), { recursive: true });
	writeFileSync(join(configDir, "memlens", "config.toml"), BASE_CONFIG);
	process.env.XDG_CONFIG_HOME = configDir;
	process.env.XDG_DATA_HOME = join(rootDir, "data");
	process.env.HOME = rootDir;
	delete process.env.MEMLENS_STORE;
});

afterEach(() => {
	vi.useRealTimers();
	process.env = { ...savedEnv };
	rmSync(rootDir, { recursive: true, force: true });
});

/** A harness root with the real prompt service and the real host service. */
interface Harness {
	readonly root: Context;
	readonly host: Memlens;
}

/** @purpose Build one harness root with a real system-prompt service and a real store. */
function newHarness(includeRuntimeContext = true): Harness {
	const root = new Context();
	new SystemPrompt(root, { includeRuntimeContext });
	const host = new Memlens(root, { cacheTtl: { "*": `${TTL_SECONDS}s` } });
	return { root, host };
}

/** One agent with its scope key. */
interface Mounted {
	readonly agent: Agent;
	readonly key: RegistrationScope;
}

/** @purpose Mount one fake agent with its preset scope and its session history. */
function mount(
	harness: Harness,
	options: {
		readonly name: string;
		readonly cwd?: string;
		readonly profile?: string;
		readonly origin?: "subagent";
		readonly history?: readonly unknown[];
	},
): Mounted {
	const presetKey: RegistrationScope = { name: `preset-${options.name}` };
	createScope(harness.root, presetKey).ctx.memlens.registerPreset({
		profile: options.profile ?? "a",
	});
	const key: RegistrationScope = { name: `agent-${options.name}` };
	const scope = createScope(harness.root, key);
	bindScopeParent(key, presetKey);
	const history = options.history ?? [];
	const agent = {
		id: `session-${options.name}`,
		ctx: scope.ctx,
		session: {
			id: `session-${options.name}`,
			header: {
				cwd: options.cwd ?? cwdAlpha,
				...(options.origin === undefined ? {} : { origin: options.origin }),
			},
			deriveMessages: () => history,
		},
		model: {
			current: () => ({ provider: "test", model: "route" }),
		},
	} as unknown as Agent;
	return { agent, key };
}

/** @purpose Register the memory context of one mounted agent. */
function register(harness: Harness, mounted: Mounted): void {
	registerMemoryContext(mounted.agent, harness.host.forAgent(mounted.agent));
}

/** @purpose Give the Memlens section text of one agent scope, or undefined. */
async function sectionOf(
	harness: Harness,
	key: RegistrationScope,
): Promise<string | undefined> {
	const assembly = await harness.root.systemPrompt.assemble({ scope: key });
	return renderContextSections(assembly).find(
		(section) => section.name === "memlens",
	)?.text;
}

/** @purpose Fire one session event at the listeners of the root. */
function fire(
	harness: Harness,
	agent: Agent,
	type: string,
	data: unknown,
): void {
	// The compaction event types come from a package that this plugin does not import.
	const emit = harness.root.emit as (name: string, ...args: unknown[]) => void;
	emit("session/event", agent.session, { type, data });
}

/** @purpose Write one live note through the core write path. */
function write(
	store: Store,
	scope: "project:alpha" | "project:beta",
	body: string,
): void {
	const result = note(store, {
		scope,
		kind: "note",
		body,
		session: "session-test",
		turn: "1",
		preset: "a",
	});
	expect(result.ok).toBe(true);
}

/** @purpose Give one runtime context message of the harness form. */
function snapshotMessage(sections: readonly { name: string; text: string }[]) {
	return { source: { kind: "runtime-context", form: "snapshot", sections } };
}

describe("memory context", () => {
	it("renders a fresh slice when the history holds no snapshot", async () => {
		const harness = newHarness();
		const mounted = mount(harness, { name: "one" });
		write(harness.host.store, "project:alpha", "alpha fact");
		register(harness, mounted);

		const text = await sectionOf(harness, mounted.key);

		expect(text).toContain("<memory>");
		expect(text).toContain('scope="project:alpha"');
		expect(text).toContain("alpha fact");
		await harness.root.fiber.dispose();
	});

	it("restores the Memlens section of the last runtime context message", async () => {
		const harness = newHarness();
		const mounted = mount(harness, {
			name: "restore",
			history: [
				snapshotMessage([
					{ name: "WORKING_DIRECTORY", text: "/work" },
					{ name: "memlens", text: "PRIOR SNAPSHOT" },
				]),
				{ source: { kind: "user" } },
			],
		});
		write(harness.host.store, "project:alpha", "alpha fact");
		register(harness, mounted);

		expect(await sectionOf(harness, mounted.key)).toBe("PRIOR SNAPSHOT");
		await harness.root.fiber.dispose();
	});

	it("keeps the exact text after a new process with the same history", async () => {
		const first = newHarness();
		const firstMount = mount(first, { name: "restart" });
		write(first.host.store, "project:alpha", "alpha fact");
		register(first, firstMount);
		const text = await sectionOf(first, firstMount.key);
		expect(text).toBeDefined();
		await first.root.fiber.dispose();

		const second = newHarness();
		const secondMount = mount(second, {
			name: "restart",
			history: [snapshotMessage([{ name: "memlens", text: text ?? "" }])],
		});
		register(second, secondMount);

		expect(await sectionOf(second, secondMount.key)).toBe(text);
		await second.root.fiber.dispose();
	});

	it("keeps one snapshot for each session", async () => {
		const harness = newHarness();
		const alpha = mount(harness, {
			name: "alpha",
			history: [snapshotMessage([{ name: "memlens", text: "ALPHA TEXT" }])],
		});
		const beta = mount(harness, {
			name: "beta",
			cwd: cwdBeta,
			history: [snapshotMessage([{ name: "memlens", text: "BETA TEXT" }])],
		});
		register(harness, alpha);
		register(harness, beta);

		expect(await sectionOf(harness, alpha.key)).toBe("ALPHA TEXT");
		expect(await sectionOf(harness, beta.key)).toBe("BETA TEXT");
		await harness.root.fiber.dispose();
	});

	it("keeps the text after a note write", async () => {
		const harness = newHarness();
		const mounted = mount(harness, { name: "write" });
		write(harness.host.store, "project:alpha", "alpha fact");
		register(harness, mounted);
		const before = await sectionOf(harness, mounted.key);

		write(harness.host.store, "project:alpha", "later fact");

		expect(await sectionOf(harness, mounted.key)).toBe(before);
		expect(before).not.toContain("later fact");
		await harness.root.fiber.dispose();
	});

	it("refreshes the text after a successful compaction only", async () => {
		const harness = newHarness();
		const mounted = mount(harness, { name: "compact" });
		write(harness.host.store, "project:alpha", "alpha fact");
		register(harness, mounted);
		const before = await sectionOf(harness, mounted.key);
		write(harness.host.store, "project:alpha", "later fact");

		fire(harness, mounted.agent, "compaction/end", { error: "boom" });
		expect(await sectionOf(harness, mounted.key)).toBe(before);

		fire(harness, mounted.agent, "compaction/end", { compactionId: "c1" });
		const after = await sectionOf(harness, mounted.key);
		expect(after).not.toBe(before);
		expect(after).toContain("later fact");
		await harness.root.fiber.dispose();
	});

	it("refreshes the text when the session is idle above the TTL", async () => {
		vi.useFakeTimers();
		const harness = newHarness();
		const mounted = mount(harness, { name: "idle" });
		write(harness.host.store, "project:alpha", "alpha fact");
		register(harness, mounted);
		const before = await sectionOf(harness, mounted.key);
		write(harness.host.store, "project:alpha", "later fact");

		expect(await sectionOf(harness, mounted.key)).toBe(before);
		vi.advanceTimersByTime(TTL_SECONDS * 1000);

		const after = await sectionOf(harness, mounted.key);
		expect(after).not.toBe(before);
		expect(after).toContain("later fact");
		await harness.root.fiber.dispose();
	});

	it("gives an off subagent no context, and an off main agent a context", async () => {
		const harness = newHarness();
		const child = mount(harness, {
			name: "child",
			profile: "child",
			origin: "subagent",
		});
		const main = mount(harness, { name: "main", profile: "child" });
		register(harness, child);
		register(harness, main);

		expect(await sectionOf(harness, child.key)).toBeUndefined();
		expect(await sectionOf(harness, main.key)).toContain("<memory>");
		await harness.root.fiber.dispose();
	});

	it("gives a propose subagent the scope catalog in the slice", async () => {
		const harness = newHarness();
		const mounted = mount(harness, { name: "propose", origin: "subagent" });
		write(harness.host.store, "project:alpha", "alpha fact");
		write(harness.host.store, "project:beta", "beta fact");
		register(harness, mounted);

		const text = await sectionOf(harness, mounted.key);

		expect(text).toContain("[project:alpha]");
		expect(text).toContain("[project:beta]");
		await harness.root.fiber.dispose();
	});

	it("keeps the context when the harness disables optional runtime context", async () => {
		const harness = newHarness(false);
		const mounted = mount(harness, { name: "required" });
		register(harness, mounted);

		expect(await sectionOf(harness, mounted.key)).toContain("<memory>");
		await harness.root.fiber.dispose();
	});

	it("renders the slice with no LLM service", async () => {
		const harness = newHarness();
		const mounted = mount(harness, { name: "no-llm" });
		write(harness.host.store, "project:alpha", "alpha fact");

		expect(harness.root.get("llm")).toBeUndefined();
		register(harness, mounted);

		expect(await sectionOf(harness, mounted.key)).toContain("alpha fact");
		await harness.root.fiber.dispose();
	});

	it("stops the timer with the agent context", async () => {
		vi.useFakeTimers();
		const harness = newHarness();
		const mounted = mount(harness, { name: "dispose" });
		register(harness, mounted);
		const handle = vi.spyOn(harness.host.store, "handle");

		await mounted.agent.ctx.fiber.dispose();
		handle.mockClear();
		vi.advanceTimersByTime(TTL_SECONDS * 1000);

		expect(handle).not.toHaveBeenCalled();
		expect(await sectionOf(harness, mounted.key)).toBeUndefined();
		await harness.root.fiber.dispose();
	});
});
