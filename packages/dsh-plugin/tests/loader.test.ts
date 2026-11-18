/**
 * #region moduleContract
 * @purpose Check that the published entries load through Cordis and keep preset settings separate.
 * @scope Built host and preset entries, native module resolution, and host unload.
 * @invariants The test opens only a temporary store and makes no model request.
 * #endregion moduleContract
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { type Agent, agentEvents } from "@deepseek-ai/dsh-agent";
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
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
