/**
 * #region moduleContract
 * @purpose Check that the published entries load through Cordis, keep preset settings separate,
 * and skip or keep the memory surface of one agent when its start or respawn fails.
 * @scope Built host and preset entries, native module resolution, host unload, and the skipped surface.
 * @invariants The test opens only a temporary store and makes no model request.
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { type Agent, agentEvents } from "@deepseek-ai/dsh-agent";
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import {
	renderContextSections,
	SystemPrompt,
} from "@deepseek-ai/dsh-system-prompt";
import { ToolsService } from "@deepseek-ai/dsh-tools";
import { afterEach, expect, it, vi } from "vitest";

let root: Context | undefined;

afterEach(async () => {
	await root?.fiber.dispose();
	root = undefined;
	vi.unstubAllEnvs();
});

// #region FUNC_agentUnder
/** @purpose Attach a test agent to a real DSH preset scope. */
function agentUnder(ctx: Context, parent: object, cwd: string): Agent {
	const agent = {} as Agent;
	const scope = createScope(ctx, agent, { parent });
	Object.assign(agent, {
		id: "loader-test",
		ctx: scope.ctx,
		session: { header: { cwd } },
	});
	return agent;
}
// #endregion FUNC_agentUnder

/** The six tool names of the memory surface. */
const MEMORY_TOOL_NAMES = [
	"memory_note",
	"memory_find",
	"memory_open",
	"memory_forget",
	"memory_review",
	"memory_map",
] as const;

it("restores a live agent through the built host entry", async () => {
	const directory = mkdtempSync(join(tmpdir(), "memlens-loader-restart-"));
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	root = new Context();
	new SystemPrompt(root, {});
	await root.plugin(ToolsService, {});
	root.provide("llm", {} as Context["llm"]);
	await root.plugin(Loader, {
		baseUrl: new URL("../package.json", import.meta.url).href,
	});
	const hostId = await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	const agent = agentUnder(root, {}, directory);
	Object.assign(agent, {
		session: { header: { cwd: directory }, deriveMessages: () => [] },
		model: { current: () => ({ provider: "test", model: "route" }) },
	});
	root.provide("agents", { list: () => [agent] } as Context["agents"]);
	root.provide("workspaceRegistry", {
		resolveByPath: async () => ({ id: "ws-loader", title: "Loader-Workspace" }),
	} as unknown as Context["workspaceRegistry"]);
	await agentEvents(root, agent).serial("agent/created", { source: "startup" });
	const key = scopeOf(agent.ctx);
	const oldTool = root.tools.get("memory_note", key);
	expect(oldTool).toBeDefined();
	const fiber = root.loader.resolve(hostId).fiber;
	if (!fiber) throw new Error("The host fiber is absent.");
	root.loader.remove(hostId);
	await fiber.dispose();
	await root.loader.await();
	expect(root.tools.get("memory_note", key)).toBeUndefined();
	await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	const note = root.tools.get("memory_note", key);
	if (!note) throw new Error("The note tool is absent.");
	expect(note).not.toBe(oldTool);
	const answer = await note.execute(
		{ body: "Built entry restart." },
		{} as Parameters<typeof note.execute>[1],
	);
	expect(answer).toEqual({
		state: "live",
		addr: "project:Loader-Workspace#0",
		id: expect.any(String),
	});
	expect(
		note.output.render({ body: "Built entry restart." }, answer as never),
	).toEqual([{ type: "text", text: "saved project:Loader-Workspace#0" }]);
	const find = root.tools.get("memory_find", key);
	if (!find) throw new Error("The find tool is absent.");
	expect(
		await find.execute(
			{ query: "restart" },
			{} as Parameters<typeof find.execute>[1],
		),
	).toMatchObject({ hits: [{ body: "Built entry restart." }] });
});

it("loads both built entries and unloads the shared store", async () => {
	const directory = mkdtempSync(join(tmpdir(), "memlens-loader-"));
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	root = new Context();
	root.provide("llm", {} as Context["llm"]);
	const baseUrl = new URL("../package.json", import.meta.url).href;
	await root.plugin(Loader, { baseUrl });
	const hostId = await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	expect(root.loader.resolve(hostId).fiber).toBeDefined();
	const store = root.memlens.store;
	const memories = [];
	for (const here of [7, 13]) {
		const key = {};
		const scope = createScope(root, key);
		const presetCtx = scope.ctx.isolate("loader");
		await presetCtx.plugin(Loader, { baseUrl });
		const loader = presetCtx.get("loader");
		if (!loader) throw new Error("The preset loader is absent.");
		const id = await loader.create({
			name: "@memlens/dsh-plugin/preset",
			config: { profile: "default", budget: { here } },
		});
		await loader.await();
		expect(loader.resolve(id).fiber).toBeDefined();
		memories.push(root.memlens.forAgent(agentUnder(root, key, directory)));
	}
	expect(memories.map((memory) => memory.config.budget.here)).toEqual([7, 13]);
	expect(memories.every((memory) => memory.store === store)).toBe(true);
	const hostFiber = root.loader.resolve(hostId).fiber;
	if (!hostFiber) throw new Error("The host fiber is absent.");
	await hostFiber.update({ budget: { directions: 3 } }, true);
	expect(root.memlens.store === store).toBe(true);
	expect(memories.map((memory) => memory.config.budget)).toEqual([
		{ here: 7, directions: 3 },
		{ here: 13, directions: 3 },
	]);
	root.loader.remove(hostId);
	await hostFiber?.dispose();
	while (hostFiber?.inertia) await hostFiber.inertia;
	await root.loader.await();
	expect(() => store.rev()).toThrow(/closed/);
});

it("skips the memory surface of one agent when its start fails", async () => {
	const directory = mkdtempSync(join(tmpdir(), "memlens-loader-skip-"));
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	root = new Context();
	new SystemPrompt(root, {});
	await root.plugin(ToolsService, {});
	root.provide("llm", {} as Context["llm"]);
	await root.plugin(Loader, {
		baseUrl: new URL("../package.json", import.meta.url).href,
	});
	await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	const broken = agentUnder(root, {}, directory);
	const healthy = agentUnder(root, {}, directory);
	for (const agent of [broken, healthy]) {
		Object.assign(agent, {
			session: { header: { cwd: directory }, deriveMessages: () => [] },
			model: { current: () => ({ provider: "test", model: "route" }) },
		});
	}
	root.provide("agents", {
		list: () => [broken, healthy],
	} as Context["agents"]);
	const host = root.memlens;
	const read = host.forAgent.bind(host);
	const mock = vi
		.spyOn(host, "forAgent")
		.mockImplementation((agent, workspace, workspaceName) => {
			if (agent === broken) throw new Error("The agent start failed.");
			return read(agent, workspace, workspaceName);
		});
	const later = vi.fn();
	root.on("agent/created", later);
	await expect(
		agentEvents(root, broken).serial("agent/created", { source: "startup" }),
	).resolves.toBeUndefined();
	expect(later).toHaveBeenCalledTimes(1);
	await agentEvents(root, healthy).serial("agent/created", {
		source: "startup",
	});
	const brokenKey = scopeOf(broken.ctx);
	const healthyKey = scopeOf(healthy.ctx);
	if (!brokenKey || !healthyKey) throw new Error("An agent scope is absent.");
	expect(mock).toHaveBeenCalled();
	for (const name of MEMORY_TOOL_NAMES)
		expect(root.tools.get(name, brokenKey)).toBeUndefined();
	const note = root.tools.get("memory_note", healthyKey);
	if (!note) throw new Error("The note tool of the healthy agent is absent.");
	expect(
		await note.execute(
			{ body: "Healthy agent note." },
			{} as Parameters<typeof note.execute>[1],
		),
	).toMatchObject({ state: "live" });
	root.tools.setExecutor({
		describe: () => ({ schemas: [] }),
		execute: async () => ({
			results: [],
			additionalContexts: [],
			concluded: false,
		}),
	});
	const sectionOf = async (key: object): Promise<string | undefined> => {
		if (!root) throw new Error("The harness root is absent.");
		const assembly = await root.systemPrompt.assemble({ scope: key });
		return renderContextSections(assembly).find(
			(section) => section.name === "memlens",
		)?.text;
	};
	expect(await sectionOf(brokenKey)).toBeUndefined();
	expect(await sectionOf(healthyKey)).toContain("<memory>");
});

it("keeps the host active when the store does not open, and gives the memory after a retry", async () => {
	const directory = mkdtempSync(join(tmpdir(), "memlens-loader-offline-"));
	const blocker = join(directory, "blocker");
	writeFileSync(blocker, "not a directory");
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", join(blocker, "store"));
	root = new Context();
	new SystemPrompt(root, {});
	await root.plugin(ToolsService, {});
	root.provide("llm", {} as Context["llm"]);
	await root.plugin(Loader, {
		baseUrl: new URL("../package.json", import.meta.url).href,
	});
	const hostId = await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	expect(root.loader.resolve(hostId).fiber).toBeDefined();
	expect(root.memlens.storeState().ready).toBe(false);
	const agent = agentUnder(root, {}, directory);
	Object.assign(agent, {
		session: { header: { cwd: directory }, deriveMessages: () => [] },
		model: { current: () => ({ provider: "test", model: "route" }) },
	});
	root.provide("agents", { list: () => [agent] } as Context["agents"]);
	await agentEvents(root, agent).serial("agent/created", { source: "startup" });
	const key = scopeOf(agent.ctx);
	if (!key) throw new Error("The agent scope is absent.");
	const offline = root.tools.get("memory_note", key);
	if (!offline)
		throw new Error("The note tool of the offline agent is absent.");
	await expect(
		offline.execute(
			{ body: "A note with no store." },
			{} as Parameters<typeof offline.execute>[1],
		),
	).rejects.toThrow(/not open/);
	root.tools.setExecutor({
		describe: () => ({ schemas: [] }),
		execute: async () => ({
			results: [],
			additionalContexts: [],
			concluded: false,
		}),
	});
	const sectionOf = async (): Promise<string | undefined> => {
		if (!root) throw new Error("The harness root is absent.");
		const assembly = await root.systemPrompt.assemble({ scope: key });
		return renderContextSections(assembly).find(
			(section) => section.name === "memlens",
		)?.text;
	};
	expect(await sectionOf()).toBeUndefined();
	rmSync(blocker);
	root.memlens.retry();
	expect(root.memlens.storeState().ready).toBe(true);
	await vi.waitFor(() => {
		expect(root?.tools.get("memory_note", key)).not.toBe(offline);
	});
	const online = root.tools.get("memory_note", key);
	if (!online)
		throw new Error("The note tool of the recovered agent is absent.");
	expect(
		await online.execute(
			{ body: "A note after the open." },
			{} as Parameters<typeof online.execute>[1],
		),
	).toMatchObject({ state: "live" });
	const recovered = await sectionOf();
	expect(recovered).toContain("<memory>");
});

it("restores the surface when the first respawn attempt of a recovered store fails", async () => {
	const directory = mkdtempSync(join(tmpdir(), "memlens-loader-kept-"));
	const blocker = join(directory, "blocker");
	writeFileSync(blocker, "not a directory");
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", join(blocker, "store"));
	root = new Context();
	new SystemPrompt(root, {});
	await root.plugin(ToolsService, {});
	root.provide("llm", {} as Context["llm"]);
	await root.plugin(Loader, {
		baseUrl: new URL("../package.json", import.meta.url).href,
	});
	await root.loader.create({ name: "@memlens/dsh-plugin" });
	await root.loader.await();
	const agent = agentUnder(root, {}, directory);
	Object.assign(agent, {
		session: { header: { cwd: directory }, deriveMessages: () => [] },
		model: { current: () => ({ provider: "test", model: "route" }) },
	});
	root.provide("agents", { list: () => [agent] } as Context["agents"]);
	await agentEvents(root, agent).serial("agent/created", { source: "startup" });
	const key = scopeOf(agent.ctx);
	if (!key) throw new Error("An agent scope is absent.");
	const offline = root.tools.get("memory_note", key);
	if (!offline)
		throw new Error("The note tool of the offline agent is absent.");
	const read = root.memlens.forAgent.bind(root.memlens);
	let calls = 0;
	const mock = vi
		.spyOn(root.memlens, "forAgent")
		.mockImplementation((target, workspace, workspaceName) => {
			calls += 1;
			// The first respawn attempt fails, and the second attempt restores the surface.
			if (calls === 1) throw new Error("The agent start failed.");
			return read(target, workspace, workspaceName);
		});
	rmSync(blocker);
	root.memlens.retry();
	expect(root.memlens.storeState().ready).toBe(true);
	await vi.waitFor(
		() => {
			expect(mock.mock.calls.length).toBeGreaterThanOrEqual(2);
		},
		{ timeout: 5000 },
	);
	root.tools.setExecutor({
		describe: () => ({ schemas: [] }),
		execute: async () => ({
			results: [],
			additionalContexts: [],
			concluded: false,
		}),
	});
	const online = root.tools.get("memory_note", key);
	if (!online)
		throw new Error("The note tool of the recovered agent is absent.");
	await expect(
		online.execute(
			{ body: "A note after the failed respawn." },
			{} as Parameters<typeof online.execute>[1],
		),
	).resolves.toMatchObject({ state: "live" });
	const assembly = await root.systemPrompt.assemble({ scope: key });
	const section = renderContextSections(assembly).find(
		(section) => section.name === "memlens",
	)?.text;
	if (!section)
		throw new Error("The memlens context of the recovered agent is absent.");
	expect(section).toContain("<memory>");
});
