/**
 * #region moduleContract
 * @purpose Share one memory store while each agent keeps the configuration of its own preset.
 * @scope The host store, scoped preset settings, per-agent configuration, and resource disposal.
 * @invariants The host owns the store. A preset owns only its configuration registration.
 * @invariants A preset cannot change the store path or expose its settings to another preset.
 * @invariants A valid base or host change affects the next configuration read of a live agent.
 * @invariants A successful base read resets the cached agent inputs, so a changed scope rule reaches
 *   each live agent with no restart.
 * @invariants The service starts once. A store that does not open keeps the service and each
 *   surface in place, with a stated error, and a bounded retry opens the store later.
 * @invariants The store opens from the layer of each base read. A broken configuration file never
 *   stops the open; it gives the default layer and a stated error.
 * @invariants A reload that resolves another store path closes the open handle and opens the new
 *   path, so a repaired file moves the store with no restart.
 * @invariants Each harness layer that the core rule rejects gives the empty layer and enters the
 *   configuration error, so no layer fails unseen.
 * @invariants Each store read goes through one accessor. An unavailable store throws a Data error
 *   and never gives an empty store.
 * @dependencies USES API: @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @memlens/core
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
	nativeDirs,
	type PatchConfig,
	type PresetConfig,
	profileNames,
	type ResolvedConfig,
	resolveConfig,
	type ScopeKey,
	Store,
	withActiveScope,
} from "@memlens/core";
import {
	type BaseRead,
	pluginActiveScope,
	pluginStorePath,
	readPluginBase,
} from "./runtime.js";

const debug = debuglog("memlens:plugin");

// #region FUNC_safePatch
/**
 * @purpose Re-read the merged harness row with the strict core rule.
 * @invariants A rejected row gives the empty layer, so one broken row blocks no session. The
 *   rejection text travels with the layer, so the caller states it.
 * @param patch - The merged row value of the harness.
 * @returns The validated patch layer and the text of a rejection, or null.
 */
function safePatch(patch: PatchConfig): {
	layer: PatchConfig;
	error: string | null;
} {
	try {
		return { layer: loadPatchConfig(patch), error: null };
	} catch (error) {
		debug("Patch layer rejected; the empty layer applies", {
			event: "patch-reject",
			error: String(error),
		});
		return { layer: {}, error: String(error) };
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

/** The delay of the first retry after a failure that is not lock contention, in milliseconds. */
const RETRY_FIRST_MS = 1_000;

/** The greatest delay between two retries of a failure that is not lock contention, in milliseconds. */
const RETRY_LIMIT_MS = 60_000;

/**
 * The delay of the first retry after the store reports the lock of another writer, in milliseconds.
 * Brief contention thus heals in seconds, and each later attempt waits longer.
 */
const RETRY_LOCK_MS = 5_000;

// #region FUNC_locked
/**
 * @purpose Tell a lost lock from a failure that another attempt cannot change.
 * @invariants The read uses the error text of the driver, because the store raises no error code.
 * @param error - The caught failure of one open attempt.
 * @returns True when a writer holds the store or the driver reports a busy file.
 */
function locked(error: unknown): boolean {
	const text = (
		error instanceof Error ? error.message : String(error)
	).toLowerCase();
	return text.includes("locked") || text.includes("busy");
}
// #endregion FUNC_locked

// #region INTERFACE_StoreState
/**
 * @purpose State whether the one store is open, and why the last open or configuration read failed.
 * @invariants The state is a read. It writes no field and starts no attempt.
 */
export interface StoreState {
	/** True when the store is open and each memory call can read it. */
	readonly ready: boolean;

	/** The text of the last failed open, else the text of the last rejected configuration layer. */
	readonly error: string | null;
}
// #endregion INTERFACE_StoreState

/**
 * The memory inputs shared by the context provider, the tools, and the console of one surface.
 * An agent surface takes its configuration from the preset of that agent, and a profile surface
 * takes it from the name of a profile.
 */
export interface AgentMemory {
	/** The open store. A read throws while the store is unavailable. */
	readonly store: Store;

	/** The open state of the store, so a surface states it without a store read. */
	readonly storeState: StoreState;

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

	/** The store directory of the next attempt. A base or host change can move it. */
	path: string;

	private handle: Store | null = null;
	private openError: string | null = null;

	/** The text of the last rejected base read, or null when the last read gave a layer. */
	private baseError: string | null = null;

	/** The text of the last rejected host layer, or null when the layer was valid. */
	private patchError: string | null = null;

	/** The text of the last rejected preset layer, or null when each layer was valid. */
	private presetError: string | null = null;

	/** The preset scope of `presetError`, so a valid registration of that scope clears the text. */
	private presetErrorScope: RegistrationScope | null = null;
	private retryWait = RETRY_FIRST_MS;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private unwatch: (() => void) | null = null;
	private readonly storeListeners = new Set<() => void>();

	/** The visible configuration error: the base error first, then the host and preset errors. */
	private get configError(): string | null {
		return this.baseError ?? this.patchError ?? this.presetError;
	}

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
		const patchRead = safePatch(patch);
		this.patch = patchRead.layer;
		this.patchError = patchRead.error;
		const read = readPluginBase(process.env);
		this.base = read.base;
		this.path = "";
		this.watchBase();
		ctx.effect(() => async () => {
			this.unwatchBase();
			this.closed = true;
			this.clearRetry();
			await Promise.all([...this.memoryDisposers].map((dispose) => dispose()));
			this.memoryDisposers.clear();
			this.listeners.clear();
			this.presetListeners.clear();
			this.storeListeners.clear();
			this.memories = new WeakMap();
			this.presets.clear();
			this.handle?.close();
			this.handle = null;
			debug("Host disposed", { event: "dispose", path: this.path });
		});
		this.open(read);
		debug("Host started", {
			event: "start",
			path: this.path,
			ready: this.handle !== null,
		});
	}

	// #region METHOD_store
	/**
	 * @purpose Give the open store, so each consumer reads one handle.
	 * @invariants An unavailable store throws a Data error that names the last failure. The read
	 *   never gives an empty store.
	 */
	get store(): Store {
		if (this.handle === null)
			throw new MemlensError(
				"Data",
				`The memory store is not open. ${this.openError ?? "The open has not run."}`,
			);
		return this.handle;
	}
	// #endregion METHOD_store

	// #region METHOD_storeState
	/**
	 * @purpose State whether the store is open, and the last failure of the open or the layers.
	 * @invariants The read writes no field and starts no attempt.
	 */
	storeState(): StoreState {
		return {
			ready: this.handle !== null,
			error: this.openError ?? this.configError,
		};
	}
	// #endregion METHOD_storeState

	// #region METHOD_onStoreChange
	/**
	 * @purpose Notify a consumer when the store opens or a base read keeps the open store, so the
	 *   consumer starts or refreshes its store work.
	 * @invariants A listener runs while the handle is set, so it reads the store.
	 * @param listener - The callback that builds the work of the open store.
	 * @returns A function that removes the callback.
	 */
	onStoreChange(listener: () => void): () => void {
		this.storeListeners.add(listener);
		return () => this.storeListeners.delete(listener);
	}
	// #endregion METHOD_onStoreChange

	// #region METHOD_retry
	/**
	 * @purpose Attempt the open now, so a repaired path opens without the timer.
	 * @invariants A disposed host and an open store make no attempt. A base or host change calls this,
	 *   so a correction of the path or the configuration applies at once.
	 */
	retry(): void {
		if (this.closed || this.handle !== null) return;
		this.retryWait = RETRY_FIRST_MS;
		this.open();
	}
	// #endregion METHOD_retry

	// #region METHOD_open
	/**
	 * @purpose Open the store from the layer of one base read, or record the failure and arm the
	 *   next attempt.
	 * @invariants The open runs in one step, so a disposer cannot overlap it and leave a handle.
	 * @invariants A configuration failure never holds the open: the read gives the default layer
	 *   and its error, and the store opens from that layer.
	 * @invariants A success clears the open error, resets the wait, and notifies each store
	 *   listener.
	 * @invariants A failure keeps the service and every surface, so no session stops.
	 * @param read - The base read of the attempt. A caller with no read takes a fresh one.
	 */
	private open(read: BaseRead = readPluginBase(process.env)): void {
		if (this.closed || this.handle !== null) return;
		this.clearRetry();
		this.adoptBase(read);
		let handle: Store;
		try {
			this.path = safeStorePath(read.base, this.patch);
			handle = new Store(this.path, read.base.language);
		} catch (error) {
			this.fail(error);
			return;
		}
		this.handle = handle;
		const recovered = this.openError !== null;
		this.openError = null;
		this.retryWait = RETRY_FIRST_MS;
		debug("Store open", { event: "open", path: this.path, recovered });
		for (const listener of this.storeListeners) {
			try {
				listener();
			} catch (error) {
				debug("Store listener failed", {
					event: "listener-error",
					error: String(error),
				});
			}
		}
	}
	// #endregion METHOD_open

	// #region METHOD_fail
	/**
	 * @purpose Record one failed attempt and arm the next one.
	 * @invariants A lost lock starts at five seconds, because a brief lock must not look broken.
	 *   Each later attempt waits longer, to the limit. Each other failure starts at one second.
	 * @invariants The wait never declines, so no attempt runs in a busy loop.
	 * @param error - The caught failure of the attempt.
	 */
	private fail(error: unknown): void {
		this.openError = error instanceof Error ? error.message : String(error);
		const contention = locked(error);
		// The wait holds its growth across failures. A success and an explicit retry reset it.
		this.retryWait = contention
			? Math.max(this.retryWait, RETRY_LOCK_MS)
			: Math.min(this.retryWait, RETRY_LIMIT_MS);
		this.arm(this.retryWait);
		debug("Store open failed", {
			event: "open-error",
			path: this.path,
			contention,
			waitMs: this.retryWait,
			error: this.openError,
		});
	}
	// #endregion METHOD_fail

	// #region METHOD_arm
	/**
	 * @purpose Arm the one retry timer.
	 * @invariants One timer waits at any time, and each arm doubles the wait to the limit.
	 * @invariants The timer holds no process open, so a host that exits stops with no wait.
	 * @param wait - The delay in milliseconds.
	 */
	private arm(wait: number): void {
		if (this.closed) return;
		this.clearRetry();
		const timer = setTimeout(() => {
			this.retryTimer = null;
			this.open();
		}, wait);
		timer.unref?.();
		this.retryTimer = timer;
		this.retryWait = Math.min(wait * 2, RETRY_LIMIT_MS);
		debug("Store retry armed", { event: "retry", waitMs: wait });
	}
	// #endregion METHOD_arm

	private clearRetry(): void {
		if (this.retryTimer === null) return;
		clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}

	// #region METHOD_adoptBase
	/** @purpose Apply the base layer of one read, so the host follows it. */
	private adoptBase(read: BaseRead): void {
		this.base = read.base;
		this.baseError = read.error;
		this.memories = new WeakMap();
	}
	// #endregion METHOD_adoptBase

	// #region METHOD_watchBase
	/**
	 * @purpose Watch the base file, so a corrected file applies with no restart.
	 * @invariants A broken root or a refused watch keeps the service and starts no timer.
	 */
	private watchBase(): void {
		try {
			const configPath = join(nativeDirs(process.env).configDir, "config.toml");
			const reload = () => this.reloadBase();
			watchFile(configPath, { interval: 1000, persistent: false }, reload);
			this.unwatch = () => unwatchFile(configPath, reload);
		} catch (error) {
			debug("Base watch skipped", { event: "watch", error: String(error) });
		}
	}
	// #endregion METHOD_watchBase

	/** Stop the base watch, when one runs. */
	private unwatchBase(): void {
		this.unwatch?.();
		this.unwatch = null;
	}

	// #region METHOD_reloadBase
	/**
	 * @purpose Apply one base read without a restart, and move the store when the read names
	 *   another path.
	 * @invariants A read that names another path closes the open handle first, so the open takes
	 *   the new path.
	 * @invariants A read that keeps the path refreshes each store listener, so a changed scope rule
	 *   reaches each live surface.
	 */
	reloadBase(): void {
		if (this.closed) return;
		const read = readPluginBase(process.env);
		let path: string;
		try {
			path = safeStorePath(read.base, this.patch);
		} catch (error) {
			// A validated layer states a usable path, so this branch holds the last known path.
			debug("Store path absent at the reload; the last path stays", {
				event: "path-reload",
				error: String(error),
			});
			path = this.path;
		}
		const moved = path !== this.path;
		if (moved) this.path = path;
		this.adoptBase(read);
		if (moved && this.handle !== null) {
			this.handle.close();
			this.handle = null;
			debug("Store path moved; the open handle closed", {
				event: "store-move",
				path,
			});
		}
		this.notify();
		if (this.handle === null) {
			this.retryWait = RETRY_FIRST_MS;
			this.open(read);
		} else {
			for (const listener of this.storeListeners) {
				try {
					listener();
				} catch (error) {
					debug("Store listener failed", {
						event: "listener-error",
						error: String(error),
					});
				}
			}
		}
		debug("Base reloaded", { event: "reload", moved, error: read.error });
	}
	// #endregion METHOD_reloadBase

	// #region METHOD_updatePatch
	/**
	 * @purpose Apply the harness layer without replacing the open store.
	 * @param patch - The new host layer.
	 */
	updatePatch(patch: PatchConfig): void {
		const read = safePatch(patch);
		this.patch = read.layer;
		this.patchError = read.error;
		this.notify();
		this.retry();
		debug("Host layer reloaded", { event: "patch-reload", error: read.error });
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
			if (this.presetErrorScope === scope) {
				this.presetError = null;
				this.presetErrorScope = null;
			}
		} catch (error) {
			this.presetError = String(error);
			this.presetErrorScope = scope;
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
		return profileNames(this.base, this.resolved.defaultProfile);
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
		const host = this;
		return {
			get store() {
				return host.store;
			},
			get storeState() {
				return host.storeState();
			},
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
	 * @param workspaceName - The workspace title, when the host has a workspace registry.
	 * @returns The store, resolved configuration, and active scope of the agent.
	 */
	forAgent(
		agent: Agent,
		workspace?: string,
		workspaceName?: string,
	): AgentMemory {
		if (this.closed)
			throw new MemlensError("Data", "The Memlens host is disposed.");
		const cached = this.memories.get(agent);
		if (cached) return cached;
		const cwd = agent.session.header.cwd;
		const scope = pluginActiveScope(
			this.base,
			cwd ?? "",
			workspace,
			workspaceName,
		);
		const host = this;
		const memory: AgentMemory = {
			get store() {
				return host.store;
			},
			get storeState() {
				return host.storeState();
			},
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
