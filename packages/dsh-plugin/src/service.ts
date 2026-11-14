/**
 * #region moduleContract
 * @purpose Share one memory store while each agent keeps the configuration of its own preset.
 * @scope The host store, scoped preset settings, per-agent configuration, and resource disposal.
 * @invariants The host owns the store. A preset owns only its configuration registration.
 * @invariants A preset cannot change the store path or expose its settings to another preset.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @memlens/core, runtime.ts.
 * @keywords memlens, service, preset, configuration, agent, lifecycle
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { type Context, Service } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
	type ScopeKey as RegistrationScope,
	scopeChainOf,
	scopeOf,
} from "@deepseek-ai/dsh-scope";
import {
	activeScope,
	type BaseConfig,
	loadPatchConfig,
	loadPresetConfig,
	MemlensError,
	type PatchConfig,
	type PresetConfig,
	type ResolvedConfig,
	resolveConfig,
	type ScopeKey,
	Store,
} from "@memlens/core";
import {
	loadPluginBase,
	pluginActiveScope,
	pluginStorePath,
} from "./runtime.js";

const debug = debuglog("memlens:plugin");

/** The memory inputs shared by the context provider and tools of one agent. */
export interface AgentMemory {
	readonly store: Store;
	readonly config: ResolvedConfig;
	readonly scope: ScopeKey;
}

declare module "@deepseek-ai/cordis" {
	interface Context {
		memlens: Memlens;
	}
}

// #region CLASS_Memlens
/**
 * @purpose Give each agent its preset settings and one host-owned store.
 * @invariants Preset registrations follow the DSH scope chain and unwind with their owner.
 * @invariants Either host disposal or agent disposal removes the cached agent inputs.
 */
export class Memlens extends Service {
	readonly base: BaseConfig;
	readonly patch: PatchConfig;
	readonly path: string;
	readonly store: Store;
	private readonly presets = new Map<RegistrationScope, PresetConfig>();
	private memories = new WeakMap<Agent, AgentMemory>();
	private closed = false;

	constructor(ctx: Context, patch: PatchConfig) {
		super(ctx, "memlens");
		this.patch = loadPatchConfig(patch);
		this.base = loadPluginBase(process.env);
		resolveConfig(this.base, this.patch, null);
		this.path = pluginStorePath(this.base, this.patch, process.env);
		this.store = new Store(this.path, this.base.language);
		ctx.effect(() => () => {
			this.closed = true;
			this.memories = new WeakMap();
			this.presets.clear();
			this.store.close();
			debug("Host disposed", { event: "dispose", path: this.path });
		});
		debug("Host opened", { event: "start", path: this.path });
	}

	// #region METHOD_registerPreset
	/**
	 * @purpose Bind one validated configuration to the caller's preset scope.
	 * @param config - The preset layer with its required profile.
	 * @returns The disposer owned by the preset plugin.
	 */
	registerPreset(config: PresetConfig): () => void {
		const scope = scopeOf(this.ctx);
		if (scope === undefined) {
			throw new MemlensError(
				"Data",
				"Load memlens/preset inside an agent preset.",
			);
		}
		const preset = loadPresetConfig(config);
		resolveConfig(this.base, this.patch, preset);
		return this.ctx.effect(() => {
			if (this.presets.has(scope)) {
				throw new MemlensError(
					"Data",
					"The preset already has Memlens settings.",
				);
			}
			this.presets.set(scope, preset);
			debug("Preset registered", { event: "preset", profile: preset.profile });
			return () => {
				this.presets.delete(scope);
				debug("Preset removed", {
					event: "preset-dispose",
					profile: preset.profile,
				});
			};
		});
	}
	// #endregion METHOD_registerPreset

	// #region METHOD_configFor
	/**
	 * @purpose Resolve a preset profile without opening a store or reading the session directory.
	 * @param agent - The agent whose DSH scope selects the preset layer.
	 * @returns The resolved layers with the actual host store path.
	 */
	configFor(agent: Agent): ResolvedConfig {
		if (this.closed)
			throw new MemlensError("Data", "The Memlens host is disposed.");
		const preset =
			scopeChainOf(scopeOf(agent.ctx))
				.map((scope) => this.presets.get(scope))
				.find((config) => config !== undefined) ?? null;
		const config = resolveConfig(this.base, this.patch, preset);
		return { ...config, store: { ...config.store, path: this.path } };
	}
	// #endregion METHOD_configFor

	// #region METHOD_forAgent
	/**
	 * @purpose Resolve shared memory inputs once for each agent without changing another agent's configuration.
	 * @param agent - The live agent with its preset scope and session directory.
	 * @param workspace - The workspace id, when the host has a workspace registry.
	 * @returns The store, resolved configuration, and active scope of the agent.
	 */
	forAgent(agent: Agent, workspace?: string): AgentMemory {
		if (this.closed)
			throw new MemlensError("Data", "The Memlens host is disposed.");
		const cached = this.memories.get(agent);
		if (cached) return cached;
		const config = this.configFor(agent);
		const cwd = agent.session.header.cwd;
		const memory: AgentMemory = {
			store: this.store,
			config,
			scope: cwd
				? pluginActiveScope(this.base, cwd, workspace)
				: activeScope(this.base.scope_default, { workspace: workspace ?? null })
						.key,
		};
		this.memories.set(agent, memory);
		agent.ctx.effect(() => () => this.memories.delete(agent));
		debug("Agent configured", {
			event: "agent",
			session: agent.id,
			profile: memory.config.defaultProfile,
			scope: memory.scope,
		});
		return memory;
	}
	// #endregion METHOD_forAgent
}
// #endregion CLASS_Memlens
