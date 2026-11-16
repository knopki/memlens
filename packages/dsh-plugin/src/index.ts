/**
 * #region moduleContract
 * @purpose Start shared memory storage and give each agent its context, tools, and nudge.
 * @scope The host entry, patch schema, service registration, context, nudge, and worker.
 * @invariants The host owns one store and one worker. The preset entry supplies only scoped configuration.
 * @invariants The host and the agent both own the memory surface of the agent.
 * @invariants A host restart restores the memory surface of each live agent.
 * @invariants The plugin checks no model metadata. A model that holds no memory is a configuration error of the user.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @memlens/core.
 * @keywords dsh, plugin, memlens, configuration, registration, context, nudge, worker
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { scopeChainOf, scopeOf } from "@deepseek-ai/dsh-scope";
import type {} from "@deepseek-ai/dsh-workspace";
import type { PatchConfig } from "@memlens/core";
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
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
	const memlens = new Memlens(ctx, config);
	ctx.on("internal/update", (next: Config) => {
		memlens.updatePatch(next);
	});
	const workerInputs = () => {
		const config = memlens.resolved;
		return {
			compaction: config.compaction,
			store: { ...config.store, path: memlens.path },
		};
	};
	const worker = new MemoryWorker(ctx, memlens.store, workerInputs(), ctx.llm);
	ctx.effect(() =>
		memlens.onConfigChange(() => worker.updateInputs(workerInputs())),
	);
	const consoleRemote = registerConsoleRemote(ctx, memlens, worker);
	const surfaces = new Map<Agent, () => unknown>();
	const pending = new Map<Agent, Promise<void>>();
	let live = true;
	ctx.effect(() => async () => {
		live = false;
		await Promise.all([...surfaces.values()].map((dispose) => dispose()));
		surfaces.clear();
	});

	const attach = (agent: Agent): Promise<void> => {
		const existing = pending.get(agent);
		if (existing) return existing;
		if (surfaces.has(agent)) return Promise.resolve();
		const task = (async () => {
			try {
				if (
					agent.session.header.origin === "subagent" &&
					memlens.configFor(agent).profile.subagents === "off"
				)
					return;
				const cwd = agent.session.header.cwd;
				const workspace = cwd
					? await ctx
							.get("workspaceRegistry")
							?.resolveByPath(cwd)
							.catch(() => undefined)
					: undefined;
				if (!live) return;
				const memory = memlens.forAgent(agent, workspace?.id, workspace?.title);
				let report = true;
				const dispose = agent.ctx.effect(() => {
					const cleanups: (() => unknown)[] = [];
					try {
						cleanups.push(registerMemoryContext(agent, memory));
						cleanups.push(registerMemoryTools(agent, memory, () => report));
						if (agent.session.header.origin !== "subagent")
							cleanups.push(registerMemoryNudge(agent, memory));
					} catch (error) {
						for (const cleanup of cleanups.reverse()) cleanup();
						throw error;
					}
					return async () => {
						for (const cleanup of cleanups.reverse()) await cleanup();
						surfaces.delete(agent);
					};
				}, "memlens.surface");
				surfaces.set(agent, () => {
					report = false;
					return dispose();
				});
			} catch (error) {
				debug("Memory surface skipped", {
					event: "agent-skip",
					session: agent.id,
					error: String(error),
				});
			}
		})().finally(() => pending.delete(agent));
		pending.set(agent, task);
		return task;
	};
	ctx.effect(() =>
		memlens.onPresetChange((scope) => {
			for (const agent of ctx.get("agents")?.list() ?? []) {
				if (!scopeChainOf(scopeOf(agent.ctx)).includes(scope)) continue;
				void (async () => {
					await pending.get(agent);
					if (!live) return;
					await surfaces.get(agent)?.();
					if (live) await attach(agent);
				})();
			}
		}),
	);
	ctx.on("agent/created", async ({ agent }) => {
		await attach(agent);
		return undefined;
	});
	ctx.on("tools/result", (exec) => {
		worker.onMemoryTool(exec.name);
	});
	ctx.effect(() => consoleRemote, "memlens: console remote");
	await Promise.all((ctx.get("agents")?.list() ?? []).map(attach));
}
// #endregion FUNC_apply
