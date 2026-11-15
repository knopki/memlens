/**
 * #region moduleContract
 * @purpose Check preset isolation and store ownership through actual Cordis plugins.
 * @scope The host service and the agent creation event.
 * @invariants Tests use temporary XDG directories and make no model call.
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Service } from "@deepseek-ai/cordis";
import { type Agent, agentEvents } from "@deepseek-ai/dsh-agent";
import { createScope } from "@deepseek-ai/dsh-scope";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolsService } from "@deepseek-ai/dsh-tools";
import { DEFAULT_CONFIG_TOML, Store } from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as host from "../src/index.js";
import * as preset from "../src/preset.js";

const roots: Context[] = [];

let nextSession = 0;

afterEach(async () => {
	for (const root of roots.splice(0)) await root.fiber.dispose();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// #region CLASS_WorkerLlm
/** @purpose Supply the LLM service name without a model call. */
class WorkerLlm extends Service {
	constructor(ctx: Context) {
		super(ctx, "llm");
	}
}
// #endregion CLASS_WorkerLlm

// #region FUNC_composition
/** @purpose Start the real host plugin under temporary configuration roots. */
async function composition(baseText?: string) {
	const directory = mkdtempSync(join(tmpdir(), "memlens-plugin-service-"));
	if (baseText !== undefined) {
		mkdirSync(join(directory, "memlens"));
		writeFileSync(join(directory, "memlens", "config.toml"), baseText);
	}
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	const root = new Context();
	roots.push(root);
	new SystemPrompt(root, {});
	root.plugin(ToolsService, {});
	await root.plugin(WorkerLlm);
	await root.plugin(host, {});
	return { root, directory };
}
// #endregion FUNC_composition

// #region FUNC_subject
/** @purpose Create an agent subject with a real scoped context and a controlled route. */
function subject(root: Context, parent?: object): Agent {
	const agent = {} as Agent;
	const scope = createScope(root, agent, parent ? { parent } : undefined);
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

describe("Memlens host service", () => {
	it("resolves preset settings without opening a second store", async () => {
		const { root } = await composition();
		const firstKey = {};
		const first = createScope(root, firstKey);
		const secondKey = {};
		const second = createScope(root, secondKey);
		await first.ctx.plugin(preset, { profile: "default", budget: { here: 7 } });
		await second.ctx.plugin(preset, {
			profile: "default",
			budget: { here: 13 },
		});
		const a = subject(root, firstKey);
		const b = subject(root, secondKey);
		await agentEvents(root, a).serial("agent/created", { source: "startup" });
		await agentEvents(root, b).serial("agent/created", { source: "startup" });
		expect(root.memlens.forAgent(a).config.budget.here).toBe(7);
		expect(root.memlens.forAgent(b).config.budget.here).toBe(13);
		expect(root.memlens.forAgent(a).store).toBe(root.memlens.forAgent(b).store);
		expect(root.memlens.forAgent(a)).toBe(root.memlens.forAgent(a));
	});

	it("removes preset settings when their owning plugin ends", async () => {
		const { root } = await composition();
		const key = {};
		const scope = createScope(root, key);
		const settings = scope.ctx.plugin(preset, {
			profile: "default",
			budget: { here: 7 },
		});
		await settings;
		expect(root.memlens.forAgent(subject(root, key)).config.budget.here).toBe(
			7,
		);
		await settings.dispose();
		expect(root.memlens.forAgent(subject(root, key)).config.budget.here).toBe(
			20,
		);
	});

	it("closes the store once when the host ends", async () => {
		const { root } = await composition();
		const store = root.memlens.store;
		const close = vi.spyOn(Store.prototype, "close");
		await root.fiber.dispose();
		expect(close).toHaveBeenCalledTimes(1);
		expect(() => store.rev()).toThrow(/closed/);
	});

	it("uses a workspace rule from the optional registry", async () => {
		const { root } = await composition(
			DEFAULT_CONFIG_TOML.replace(
				"rules = []",
				'rules = [{ match = "workspace", id = "ws-a", key = "project:workspace" }]',
			),
		);
		root.provide("workspaceRegistry", {
			resolveByPath: async () => ({ id: "ws-a" }),
		} as unknown as Context["workspaceRegistry"]);
		const agent = subject(root);
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(root.memlens.forAgent(agent).scope).toBe("project:workspace");
	});

	it("resumes a session whose former directory is absent", async () => {
		const { root, directory } = await composition();
		root.provide("workspaceRegistry", {
			resolveByPath: async () => {
				throw new Error("ENOENT");
			},
		} as unknown as Context["workspaceRegistry"]);
		const agent = subject(root);
		Object.assign(agent, {
			session: {
				header: { cwd: join(directory, "missing") },
				deriveMessages: () => [],
			},
		});
		await agentEvents(root, agent).serial("agent/created", {
			source: "resume",
		});
		expect(root.memlens.forAgent(agent).scope).toBe("user:notes");
	});

	it("uses the configured fallback when a session has no directory", async () => {
		const { root } = await composition();
		const agent = subject(root);
		Object.assign(agent, {
			session: { header: {}, deriveMessages: () => [] },
		});
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(root.memlens.forAgent(agent).scope).toBe("user:notes");
	});

	it("skips directory and model checks for an off-mode child", async () => {
		const { root } = await composition(
			DEFAULT_CONFIG_TOML.replace(
				'scopes = ["*"]',
				'scopes = ["*"]\nsubagents = "off"',
			),
		);
		const lookup = vi.fn(async () => {
			throw new Error("No lookup expected");
		});
		root.provide("workspaceRegistry", {
			resolveByPath: lookup,
		} as unknown as Context["workspaceRegistry"]);
		const agent = subject(root);
		Object.assign(agent, {
			session: {
				header: { cwd: tmpdir(), origin: "subagent" },
				deriveMessages: () => [],
			},
		});
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(lookup).not.toHaveBeenCalled();
	});
});
