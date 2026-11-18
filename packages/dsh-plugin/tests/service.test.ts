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
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import {
	renderContextSections,
	SystemPrompt,
} from "@deepseek-ai/dsh-system-prompt";
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
	const hostFiber = root.plugin(host, {});
	await hostFiber;
	return { root, directory, hostFiber };
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

	it("restores a live agent after the host restarts", async () => {
		const { root, hostFiber } = await composition();
		const key = {};
		const scope = createScope(root, key);
		await scope.ctx.plugin(preset, { profile: "default", budget: { here: 7 } });
		const agent = subject(root, key);
		root.provide("agents", { list: () => [agent] } as Context["agents"]);
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		const agentKey = scopeOf(agent.ctx);
		if (!agentKey) throw new Error("The agent scope is absent.");
		const oldTool = root.tools.get("memory_note", agentKey);
		expect(oldTool).toBeDefined();
		await hostFiber.dispose();
		expect(root.tools.get("memory_note", agentKey)).toBeUndefined();
		const nextHost = root.plugin(host, {});
		await nextHost;
		await vi.waitFor(() => {
			expect(root.memlens.forAgent(agent).config.budget.here).toBe(7);
			expect(root.tools.get("memory_note", agentKey)).toBeDefined();
		});
		const tool = root.tools.get("memory_note", agentKey);
		expect(tool).not.toBe(oldTool);
		const result = await tool?.execute(
			{ body: "A note after restart." },
			{} as Parameters<NonNullable<typeof tool>["execute"]>[1],
		);
		expect(result).toMatchObject({ state: "live" });
		const find = root.tools.get("memory_find", agentKey);
		if (!find) throw new Error("The find tool is absent.");
		const found = await find.execute(
			{ query: "restart" },
			{} as Parameters<typeof find.execute>[1],
		);
		expect(found).toMatchObject({ hits: [{ body: "A note after restart." }] });
		root.tools.setExecutor({
			describe: () => ({ schemas: [] }),
			execute: async () => ({
				results: [],
				additionalContexts: [],
				concluded: false,
			}),
		});
		const assembly = await root.systemPrompt.assemble({ scope: agentKey });
		expect(
			renderContextSections(assembly).map((section) => section.name),
		).toContain("memlens");
	});

	it("restores an off-mode child after its preset registers again", async () => {
		const { root, hostFiber } = await composition(
			`${DEFAULT_CONFIG_TOML}\n[profile.off]\nscopes = ["*"]\nsubagents = "off"\n`,
		);
		const key = {};
		const scope = createScope(root, key);
		await scope.ctx.plugin(preset, { profile: "off" });
		const agent = subject(root, key);
		Object.assign(agent.session.header, { origin: "subagent" });
		root.provide("agents", { list: () => [agent] } as Context["agents"]);
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(root.tools.get("memory_find", scopeOf(agent.ctx))).toBeUndefined();
		await hostFiber.dispose();
		await root.plugin(host, {});
		expect(root.memlens.forAgent(agent).config.profile.subagents).toBe("off");
		expect(root.tools.get("memory_find", scopeOf(agent.ctx))).toBeUndefined();
	});

	it("removes agent memory effects on each host restart", async () => {
		const { root, hostFiber } = await composition();
		const agent = subject(root);
		root.provide("agents", { list: () => [agent] } as Context["agents"]);
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		let fiber = hostFiber;
		for (let index = 0; index < 3; index += 1) {
			await fiber.dispose();
			expect(
				agent.ctx.fiber
					.getEffects()
					.filter((effect) => effect.label === "memlens.agent-memory"),
			).toHaveLength(0);
			fiber = root.plugin(host, {});
			await fiber;
			expect(
				agent.ctx.fiber
					.getEffects()
					.filter((effect) => effect.label === "memlens.agent-memory"),
			).toHaveLength(1);
		}
	});

	it("reports a child proposal only when the child ends", async () => {
		const { root, hostFiber } = await composition();
		const child = subject(root);
		Object.assign(child.session.header, {
			origin: "subagent",
			parentSession: "parent",
		});
		const inject = vi.fn();
		root.provide("agents", {
			list: () => [child],
			get: () => ({ inject }),
		} as unknown as Context["agents"]);
		await agentEvents(root, child).serial("agent/created", {
			source: "startup",
		});
		const tool = root.tools.get("memory_note", scopeOf(child.ctx));
		if (!tool) throw new Error("The note tool is absent.");
		expect(
			await tool.execute(
				{ body: "Child proposal." },
				{} as Parameters<typeof tool.execute>[1],
			),
		).toMatchObject({ proposed: true });
		await hostFiber.dispose();
		expect(inject).not.toHaveBeenCalled();
		await root.plugin(host, {});
		await child.ctx.fiber.dispose();
		expect(inject).toHaveBeenCalledTimes(1);
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

	it("uses the workspace title when no Git repository exists", async () => {
		const { root } = await composition();
		root.provide("workspaceRegistry", {
			resolveByPath: async () => ({ id: "ws-a", title: "Workspace-A" }),
		} as unknown as Context["workspaceRegistry"]);
		const agent = subject(root);
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(root.memlens.forAgent(agent).scope).toBe("project:workspace-a");
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
		expect(root.memlens.forAgent(agent).scope).toBe("project:missing");
	});

	it("uses the configured default key when a session has no directory", async () => {
		const { root } = await composition();
		const agent = subject(root);
		Object.assign(agent, {
			session: { header: {}, deriveMessages: () => [] },
		});
		await agentEvents(root, agent).serial("agent/created", {
			source: "startup",
		});
		expect(root.memlens.forAgent(agent).scope).toBe("project:misc");
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
