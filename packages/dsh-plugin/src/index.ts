/**
 * #region moduleContract
 * @purpose Start shared memory storage and give each agent its context, tools, and nudge.
 * @scope The host entry, patch schema, service registration, context, nudge, and worker.
 * @invariants The host owns one store and one worker. The preset entry supplies only scoped configuration.
 * @invariants The memory context and each memory tool live on the agent context of their agent.
 * @invariants The plugin checks no model metadata. A model that holds no memory is a configuration error of the user.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @memlens/core.
 * @keywords dsh, plugin, memlens, configuration, registration, context, nudge, worker
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-workspace";
import { type PatchConfig, parseDuration } from "@memlens/core";
import { PatchConfigSchema } from "./config.js";
import { registerConsoleRemote } from "./console/remote.js";
import { registerMemoryContext } from "./memory-context.js";
import { registerMemoryTools } from "./memory-tools.js";
import { registerMemoryNudge } from "./nudge.js";
import { Memlens } from "./service.js";
import { MemoryWorker } from "./worker.js";

const debug = debuglog("memlens:plugin");

/** The settings schema of the host plugin. */
export const Config = PatchConfigSchema;
export { type AgentMemory, Memlens } from "./service.js";

export type Config = PatchConfig;

/** The diagnostic plugin name. The bundle row id is memlens. */
export const name = "dsh-memlens";

/** The LLM service runs the compaction model calls of the worker. */
export const inject = ["llm"];

// #region FUNC_apply
/**
 * @purpose Register the shared store, the worker, and the memory surface of each agent.
 * @invariants A memory error skips the memory surface of that agent and blocks no session.
 * @param ctx - The host plugin context.
 * @param config - The validated patch layer.
 */
export function apply(ctx: Context, config: Config = {}): void {
	const memlens = new Memlens(ctx, config);
	const cacheTtl = Object.fromEntries(
		Object.entries(memlens.resolved.cacheTtl).map(([glob, value]) => [
			glob,
			parseDuration(value),
		]),
	);
	const worker = new MemoryWorker(
		ctx,
		memlens.store,
		{
			compaction: memlens.resolved.compaction,
			store: { ...memlens.resolved.store, path: memlens.path },
			cacheTtl,
		},
		ctx.llm,
	);
	const consoleRemote = registerConsoleRemote(ctx, memlens, worker);
	const disabled = (agent: Agent) =>
		agent.session.header.origin === "subagent" &&
		memlens.configFor(agent).profile.subagents === "off";

	ctx.on("agent/created", async ({ agent }) => {
		if (disabled(agent)) return undefined;
		const cwd = agent.session.header.cwd;
		const workspace = cwd
			? await ctx
					.get("workspaceRegistry")
					?.resolveByPath(cwd)
					.catch(() => undefined)
			: undefined;
		try {
			const memory = memlens.forAgent(agent, workspace?.id);
			registerMemoryContext(agent, memory);
			registerMemoryTools(agent, memory);
			if (agent.session.header.origin !== "subagent")
				registerMemoryNudge(agent, memory);
		} catch (error) {
			debug(
				"Memory surface skipped after an error; the session continues without memory",
				{ event: "agent-skip", session: agent.id, error: String(error) },
			);
			return undefined;
		}
		return undefined;
	});
	ctx.on("tools/result", (exec) => {
		worker.onMemoryTool(exec.name);
	});
	ctx.effect(() => consoleRemote, "memlens: console remote");
}
// #endregion FUNC_apply
