/**
 * #region moduleContract
 * @purpose Prove the host service binds one preset configuration to the DSH scope chain of each agent.
 * @scope The real Cordis context, DSH scopes, preset registration, agent lookup, and disposal.
 * @invariants A preset registration uses the caller scope, not the host scope.
 * @invariants Two agent scopes with different presets receive different profiles from one store.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @deepseek-ai/dsh-agent, ../src/service.ts
 * @keywords test, cordis, scope, preset, agent, memlens
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
	type ScopeKey,
	scopeChainOf,
	scopeOf,
} from "@deepseek-ai/dsh-scope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pluginActiveScope } from "../src/runtime.js";
import { Memlens } from "../src/service.js";

const BASE_CONFIG = `language = "en"
defaultProfile = "a"

[profile.a]
scopes = ["*"]

[profile.a.budget]
here = 20
directions = 10

[profile.b]
scopes = ["*"]

[profile.b.budget]
here = 20
directions = 10

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"

[scope_default]
default = "user:notes"
`;

const savedEnv = { ...process.env };

let rootDir: string;

let cwd: string;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), "memlens-composition-"));
	cwd = join(rootDir, "project");
	mkdirSync(cwd, { recursive: true });
	const configDir = join(rootDir, "config");
	mkdirSync(join(configDir, "memlens"), { recursive: true });
	writeFileSync(join(configDir, "memlens", "config.toml"), BASE_CONFIG);
	process.env.XDG_CONFIG_HOME = configDir;
	process.env.XDG_DATA_HOME = join(rootDir, "data");
	process.env.HOME = rootDir;
	delete process.env.MEMLENS_STORE;
});

afterEach(() => {
	process.env = { ...savedEnv };
	rmSync(rootDir, { recursive: true, force: true });
});

/** A scope key is an opaque object, not a string. */
function key(name: string): ScopeKey {
	return { name };
}

function fakeAgent(
	ctx: Context,
	id: string,
	meta: Record<string, unknown> = {},
): Agent {
	return {
		id,
		ctx,
		session: { header: { cwd, ...meta } },
	} as unknown as Agent;
}

function presetScope(root: Context, name: string) {
	const scopeKey = key(name);
	return { key: scopeKey, scope: createScope(root, scopeKey) };
}

function agentScope(
	root: Context,
	name: string,
	preset: ReturnType<typeof presetScope>,
) {
	const scopeKey = key(name);
	const scope = createScope(root, scopeKey);
	bindScopeParent(scopeKey, preset.key);
	return { key: scopeKey, scope };
}

describe("Memlens preset scoping", () => {
	let root: Context;
	let host: Memlens;

	beforeEach(() => {
		root = new Context();
		host = new Memlens(root, {});
	});

	afterEach(async () => {
		await root.fiber.dispose();
	});

	it("registers a preset under the caller scope", () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({ profile: "a" });

		expect(scopeOf(preset.scope.ctx)).toBe(preset.key);
		expect(host.base.defaultProfile).toBe("a");
	});

	it("resolves each agent from its nearest preset scope", () => {
		const presetA = presetScope(root, "preset-a");
		presetA.scope.ctx.memlens.registerPreset({ profile: "a" });
		const presetB = presetScope(root, "preset-b");
		presetB.scope.ctx.memlens.registerPreset({ profile: "b" });

		const agentA = agentScope(root, "agent-a", presetA);
		const agentB = agentScope(root, "agent-b", presetB);
		const memoryA = host.forAgent(fakeAgent(agentA.scope.ctx, "session-a"));
		const memoryB = host.forAgent(fakeAgent(agentB.scope.ctx, "session-b"));

		expect(scopeChainOf(scopeOf(agentA.scope.ctx))).toEqual([
			agentA.key,
			presetA.key,
		]);
		expect(memoryA.config.defaultProfile).toBe("a");
		expect(memoryB.config.defaultProfile).toBe("b");
		expect(memoryA.store).toBe(host.store);
		expect(memoryB.store).toBe(host.store);
		expect(memoryA.scope).toBe(pluginActiveScope(host.base, cwd));
	});

	it("caches one memory value for one agent", () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({ profile: "a" });
		const scope = agentScope(root, "agent-a", preset);
		const agent = fakeAgent(scope.scope.ctx, "session-a");

		expect(host.forAgent(agent)).toBe(host.forAgent(agent));
	});

	it("reloads the base for existing agents and keeps the last valid file", () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({
			profile: "a",
			budget: { directions: 7 },
		});
		const scope = agentScope(root, "agent-a", preset);
		const memory = host.forAgent(fakeAgent(scope.scope.ctx, "session-a"));
		const initialScope = memory.scope;
		const initialPath = host.path;
		const path = join(rootDir, "config", "memlens", "config.toml");
		writeFileSync(
			path,
			BASE_CONFIG.replace("here = 20", "here = 3").replace(
				'default = "user:notes"',
				'default = "user:other"',
			),
		);
		host.reloadBase();
		expect(memory.config.budget).toEqual({ here: 3, directions: 7 });
		expect(memory.scope).toBe(initialScope);
		expect(host.path).toBe(initialPath);
		writeFileSync(path, "not toml = [");
		host.reloadBase();
		expect(memory.config.budget.here).toBe(3);
	});

	it("detects a base file change without a host restart", async () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({ profile: "a" });
		const scope = agentScope(root, "agent-a", preset);
		const memory = host.forAgent(fakeAgent(scope.scope.ctx, "session-a"));
		writeFileSync(
			join(rootDir, "config", "memlens", "config.toml"),
			BASE_CONFIG.replace("here = 20", "here = 4"),
		);
		await vi.waitFor(() => expect(memory.config.budget.here).toBe(4), {
			timeout: 4000,
			interval: 100,
		});
	});

	it("rejects a second registration in one preset scope", () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({ profile: "a" });

		expect(() =>
			preset.scope.ctx.memlens.registerPreset({ profile: "b" }),
		).toThrow(/already has Memlens settings/);
	});

	it("closes the host store and rejects a later lookup", async () => {
		const preset = presetScope(root, "preset-a");
		preset.scope.ctx.memlens.registerPreset({ profile: "a" });
		const scope = agentScope(root, "agent-a", preset);
		const agent = fakeAgent(scope.scope.ctx, "session-a");
		host.forAgent(agent);

		await root.fiber.dispose();

		expect(() => host.forAgent(agent)).toThrow(/disposed/);
	});
});
