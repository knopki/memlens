/**
 * #region moduleContract
 * @purpose Start shared memory storage and give each agent its context, tools, and nudge.
 * @scope The host entry, patch schema, service registration, context, nudge, and worker.
 * @invariants The host owns one store and at most one worker. The preset entry supplies only scoped
 *   configuration.
 * @invariants The host and the agent both own the memory surface of the agent.
 * @invariants A store that is not open gives the stated context and the tools that answer errors.
 *  That surface gets no nudge, because the nudge asks for a memory write. The respawn adds it at
 *  the open.
 * @invariants A host restart restores the memory surface of each live agent.
 * @invariants A store that opens after the start starts the worker and respawns the surface of each
 *  live agent, so a session that began on an unavailable store gets its memory later.
 * @invariants A respawn removes the old surface first, because the host registries reject a second
 *  registration of one name. A failed attach repeats a bounded count of times, so a transient
 *  failure costs no memory surface. A respawn that exhausts its attempts logs the loss.
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

/** The greatest count of attach attempts after one respawn disposed a working surface. */
const RESPAWN_ATTEMPTS = 3;

/** The pause between two attach attempts of one respawn, in milliseconds. */
const RESPAWN_PAUSE_MS = 1_000;

/** @purpose Wait one pause without holding the event loop. */
function pause(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
	});
}

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
	let worker: MemoryWorker | undefined;
	const startWorker = (): void => {
		if (worker !== undefined || !memlens.storeState().ready) return;
		worker = new MemoryWorker(ctx, memlens.store, workerInputs(), ctx.llm);
		debug("Worker started", { event: "start", path: memlens.path });
	};
	startWorker();
	ctx.effect(() =>
		memlens.onConfigChange(() => worker?.updateInputs(workerInputs())),
	);
	const consoleRemote = registerConsoleRemote(ctx, memlens, () => worker);
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
				let entry: () => unknown = () => {};
				const dispose = agent.ctx.effect(() => {
					const cleanups: (() => unknown)[] = [];
					try {
						cleanups.push(registerMemoryContext(agent, memory));
						cleanups.push(registerMemoryTools(agent, memory, () => report));
						if (
							agent.session.header.origin !== "subagent" &&
							memory.storeState.ready
						)
							cleanups.push(registerMemoryNudge(agent, memory));
					} catch (error) {
						for (const cleanup of cleanups.reverse()) cleanup();
						throw error;
					}
					return async () => {
						for (const cleanup of cleanups.reverse()) await cleanup();
						// Remove the map entry only while it still names this surface, so a
						// respawn that already installed a newer surface keeps its entry.
						if (surfaces.get(agent) === entry) surfaces.delete(agent);
					};
				}, "memlens.surface");
				entry = () => {
					report = false;
					return dispose();
				};
				surfaces.set(agent, entry);
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
	const respawn = (agent: Agent): void => {
		void (async () => {
			await pending.get(agent);
			if (!live) return;
			// The registries of the host reject a second registration of the same name, so the
			// old surface must leave before the new one can stand. A failed attach then repeats
			// a bounded count of times, so a transient failure costs no memory surface.
			const old = surfaces.get(agent);
			if (old !== undefined) {
				surfaces.delete(agent);
				await old();
			}
			for (let attempt = 1; ; attempt++) {
				if (!live) return;
				await attach(agent);
				if (surfaces.has(agent)) return;
				if (attempt >= RESPAWN_ATTEMPTS) {
					debug("Memory surface lost after the respawn attempts", {
						event: "respawn-lost",
						session: agent.id,
						attempts: attempt,
					});
					return;
				}
				debug("Memory surface respawn failed; one more attempt follows", {
					event: "respawn-retry",
					session: agent.id,
					attempt,
				});
				await pause(RESPAWN_PAUSE_MS);
			}
		})();
	};
	ctx.effect(() =>
		memlens.onPresetChange((scope) => {
			for (const agent of ctx.get("agents")?.list() ?? []) {
				if (!scopeChainOf(scopeOf(agent.ctx)).includes(scope)) continue;
				respawn(agent);
			}
		}),
	);
	ctx.effect(() =>
		memlens.onStoreChange(() => {
			startWorker();
			debug("Store opened; the memory surfaces respawn", {
				event: "store-open",
				agents: ctx.get("agents")?.list().length ?? 0,
			});
			for (const agent of ctx.get("agents")?.list() ?? []) respawn(agent);
		}),
	);
	ctx.on("agent/created", async ({ agent }) => {
		await attach(agent);
		return undefined;
	});
	ctx.on("tools/result", (exec) => {
		worker?.onMemoryTool(exec.name);
	});
	ctx.effect(() => consoleRemote, "memlens: console remote");
	await Promise.all((ctx.get("agents")?.list() ?? []).map(attach));
}
// #endregion FUNC_apply
