/**
 * #region moduleContract
 * @purpose Share one memory store while each agent keeps the configuration of its own preset.
 * @scope The host store, scoped preset settings, per-agent configuration, and resource disposal.
 * @invariants The host owns the store. A preset owns only its configuration registration.
 * @invariants A preset cannot change the store path or expose its settings to another preset.
 * @invariants A valid base or host change affects the next configuration read of a live agent.
 * @invariants A base change keeps the open store, its language, and each agent scope.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @memlens/core, runtime.ts.
 * @keywords memlens, service, preset, configuration, agent, lifecycle
 * #endregion moduleContract
 */

import { unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
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
	withActiveScope,
	xdgDirs,
} from "@memlens/core";
import {
	loadPluginBase,
	pluginActiveScope,
	pluginStorePath,
} from "./runtime.js";

const debug = debuglog("memlens:plugin");

// #region FUNC_safePatch
/**
 * @purpose Re-read the merged harness row with the strict core rule.
 * @invariants A rejected row gives the empty layer, so one broken row blocks no session.
 * @param patch - The merged row value of the harness.
 * @returns The validated patch layer.
 */
function safePatch(patch: PatchConfig): PatchConfig {
	try {
		return loadPatchConfig(patch);
	} catch (error) {
		debug("Patch layer rejected; the empty layer applies", {
			event: "patch-reject",
			error: String(error),
		});
		return {};
	}
}
// #endregion FUNC_safePatch

// #region FUNC_safeStorePath
/**
 * @purpose Select the store directory, and fall back to the base directory when the patch gives
 * no usable path.
 * @param base - The validated base layer.
 * @param patch - The validated patch layer.
 * @returns The absolute store directory.
 */
function safeStorePath(base: BaseConfig, patch: PatchConfig): string {
	try {
		return pluginStorePath(base, patch, process.env);
	} catch (error) {
		debug("Store path rejected; the base path applies", {
			event: "store-path-reject",
			error: String(error),
		});
		return pluginStorePath(base, {}, process.env);
	}
}
// #endregion FUNC_safeStorePath

/**
 * The memory inputs shared by the context provider, the tools, and the console of one surface.
 * An agent surface takes its configuration from the preset of that agent, and a profile surface
 * takes it from the name of a profile.
 */
export interface AgentMemory {
	readonly store: Store;
	readonly config: ResolvedConfig;
	readonly scope: ScopeKey;
}

// #region FUNC_withSessionScope
/**
 * @purpose Join the active scope key into the resolved profile of one agent, so the session works in
 * its own scope.
 * @invariants The join adds the literal key of the active scope when no profile glob matches it.
 * @invariants The join writes no configuration file and applies to each configuration read.
 * @param config - The resolved layers of the agent.
 * @param scope - The active scope key of the agent.
 * @returns The resolved configuration with the joined scope list.
 */
function withSessionScope(
	config: ResolvedConfig,
	scope: ScopeKey,
): ResolvedConfig {
	const scopes = withActiveScope(config.profile.scopes, scope);
	return scopes.length === config.profile.scopes.length
		? config
		: { ...config, profile: { ...config.profile, scopes } };
}
// #endregion FUNC_withSessionScope

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
	base: BaseConfig;
	patch: PatchConfig;
	readonly path: string;
	readonly store: Store;

	/** The host-level resolution, with no preset layer. */
	get resolved(): ResolvedConfig {
		return resolveConfig(this.base, this.patch, null);
	}
	private readonly listeners = new Set<() => void>();
	private readonly presetListeners = new Set<
		(scope: RegistrationScope) => void
	>();
	private readonly presets = new Map<RegistrationScope, PresetConfig>();
	private memories = new WeakMap<Agent, AgentMemory>();
	private readonly memoryDisposers = new Set<() => unknown>();
	private closed = false;

	constructor(ctx: Context, patch: PatchConfig) {
		super(ctx, "memlens");
		this.patch = safePatch(patch);
		this.base = loadPluginBase(process.env);
		this.path = safeStorePath(this.base, this.patch);
		this.store = new Store(this.path, this.base.language);
		const configPath = join(xdgDirs(process.env).configDir, "config.toml");
		const reload = () => this.reloadBase();
		watchFile(configPath, { interval: 1000, persistent: false }, reload);
		ctx.effect(() => async () => {
			unwatchFile(configPath, reload);
			await Promise.all([...this.memoryDisposers].map((dispose) => dispose()));
			this.memoryDisposers.clear();
			this.listeners.clear();
			this.presetListeners.clear();
			this.closed = true;
			this.memories = new WeakMap();
			this.presets.clear();
			this.store.close();
			debug("Host disposed", { event: "dispose", path: this.path });
		});
		debug("Host opened", { event: "start", path: this.path });
	}

	// #region METHOD_reloadBase
	/**
	 * @purpose Apply a valid base file without replacing the open store.
	 * @invariants A rejected file leaves the last valid configuration in use.
	 */
	reloadBase(): void {
		try {
			const base = loadPluginBase(process.env, true);
			this.base = { ...base, language: this.base.language };
			debug("Base reloaded", { event: "reload" });
			this.notify();
		} catch (error) {
			debug("Base reload rejected", {
				event: "reload-reject",
				error: String(error),
			});
		}
	}
	// #endregion METHOD_reloadBase

	// #region METHOD_updatePatch
	/**
	 * @purpose Apply the harness layer without replacing the open store.
	 * @param patch - The new host layer.
	 */
	updatePatch(patch: PatchConfig): void {
		this.patch = safePatch(patch);
		this.notify();
		debug("Host layer reloaded", { event: "patch-reload" });
	}
	// #endregion METHOD_updatePatch

	// #region METHOD_onConfigChange
	/**
	 * @purpose Notify a consumer when a configuration layer changes.
	 * @param listener - The callback that refreshes the consumer state.
	 * @returns A function that removes the callback.
	 */
	onConfigChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	// #endregion METHOD_onConfigChange

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	// #region METHOD_onPresetChange
	/**
	 * @purpose Notify the host when one preset scope changes.
	 * @param listener - The callback that receives the preset scope.
	 * @returns A function that removes the callback.
	 */
	onPresetChange(listener: (scope: RegistrationScope) => void): () => void {
		this.presetListeners.add(listener);
		return () => this.presetListeners.delete(listener);
	}
	// #endregion METHOD_onPresetChange

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
		let preset: PresetConfig;
		try {
			preset = loadPresetConfig(config);
		} catch (error) {
			debug("Preset layer rejected; the empty layer applies", {
				event: "preset-reject",
				error: String(error),
			});
			preset = {};
		}
		resolveConfig(this.base, this.patch, preset);
		return this.ctx.effect(() => {
			if (this.presets.has(scope)) {
				throw new MemlensError(
					"Data",
					"The preset already has Memlens settings.",
				);
			}
			this.presets.set(scope, preset);
			for (const listener of this.presetListeners) listener(scope);
			debug("Preset registered", { event: "preset", profile: preset.profile });
			return () => {
				this.presets.delete(scope);
				for (const listener of this.presetListeners) listener(scope);
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

	// #region METHOD_profiles
	/**
	 * @purpose List the profile names that the console offers, so the switcher always holds one name.
	 * @invariants The list follows the base file order. The list ends with the default profile name
	 *   when the base file does not name it.
	 */
	profiles(): string[] {
		const names = Object.keys(this.base.profile);
		const fallback = this.resolved.defaultProfile;
		return names.includes(fallback) ? names : [...names, fallback];
	}
	// #endregion METHOD_profiles

	// #region METHOD_forProfile
	/**
	 * @purpose Resolve the shared memory inputs of one named profile, so the console reads and
	 *   writes that profile with no agent.
	 * @invariants An absent profile uses the default values of the base file, so the console
	 *   answers and holds no failure.
	 * @invariants The fallback scope is the default scope key of the base file, and the profile
	 *   lists that key.
	 * @param name - The profile name of the request.
	 * @returns The store, the resolved configuration, and the fallback scope of the profile.
	 */
	forProfile(name: string): AgentMemory {
		if (this.closed)
			throw new MemlensError("Data", "The Memlens host is disposed.");
		const scope = activeScope(this.base.scope_default, {
			workspace: null,
		}).key;
		return {
			store: this.store,
			config: withSessionScope(
				resolveConfig(this.base, this.patch, { profile: name }),
				scope,
			),
			scope,
		};
	}
	// #endregion METHOD_forProfile

	// #region METHOD_forAgent
	/**
	 * @purpose Resolve shared memory inputs once for each agent without changing another agent's configuration.
	 * @invariants Each configuration read joins the active scope key into the scope list of the profile.
	 * @param agent - The live agent with its preset scope and session directory.
	 * @param workspace - The workspace id, when the host has a workspace registry.
	 * @returns The store, resolved configuration, and active scope of the agent.
	 */
	forAgent(agent: Agent, workspace?: string): AgentMemory {
		if (this.closed)
			throw new MemlensError("Data", "The Memlens host is disposed.");
		const cached = this.memories.get(agent);
		if (cached) return cached;
		const cwd = agent.session.header.cwd;
		const scope = cwd
			? pluginActiveScope(this.base, cwd, workspace)
			: activeScope(this.base.scope_default, { workspace: workspace ?? null })
					.key;
		const host = this;
		const memory: AgentMemory = {
			store: this.store,
			get config() {
				return withSessionScope(host.configFor(agent), scope);
			},
			scope,
		};
		this.memories.set(agent, memory);
		const dispose = agent.ctx.effect(
			() => () => {
				this.memories.delete(agent);
				this.memoryDisposers.delete(dispose);
			},
			"memlens.agent-memory",
		);
		this.memoryDisposers.add(dispose);
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
