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
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createScope } from "@deepseek-ai/dsh-scope";
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
