/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give each agent its memory slice as required runtime context, and hold one text
 * until an accepted trigger asks for a new render.
 * @scope
 *  - The context registration, the restore from the session history, the refresh triggers,
 *    and the idle timer.
 *  - NOT: the render of the slice, the snapshot publication, the tools, and the nudge.
 * @invariants
 *  - The provider answers the current text. The provider reads no row.
 *  - A render reads rows only, calls no model, and waits for no summary build.
 *  - The text changes at a fresh session, a successful compaction, and an idle time above the TTL.
 *  - An `off` subagent gets no registration.
 *  - The registration and the timer end with the agent context.
 * @dependencies @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @deepseek-ai/dsh-system-prompt, @memlens/core.
 * @keywords context, snapshot, runtime-context, restore, compaction, idle, ttl, subagent
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-system-prompt";
import {
	type ContextInput,
	type DirectionLine,
	directionsData,
	liveCounts,
	loadView,
	nowIso,
	renderContext,
	type ScopeKey,
	textOfLine,
	topLineOf,
	ttlSeconds,
	visibleScopes,
} from "@memlens/core";
import type { AgentMemory } from "./service.js";

const debug = debuglog("memlens:plugin:context");

/** The context name. The harness joins the named snapshot sections by this name. */
const CONTEXT_NAME = "memlens";

/** The context order. It comes after the last built-in runtime context. */
const CONTEXT_ORDER = 220;

/** The greatest delay one timer accepts, in milliseconds. */
const MAX_TIMER_MS = 2 ** 31 - 1;

// #region FUNC_registerMemoryContext
/**
 * @purpose Give one agent its memory slice as required runtime context, and refresh the text
 * at the accepted triggers.
 * @invariants The registration takes no snapshot table and writes no row.
 * @invariants A refresh with the same text keeps the old text.
 * @param agent - The live agent that owns the context scope.
 * @param memory - The store, the resolved configuration, and the active scope of the agent.
 */
export function registerMemoryContext(agent: Agent, memory: AgentMemory): void {
	if (
		agent.session.header.origin === "subagent" &&
		memory.config.profile.subagents === "off"
	) {
		debug("Context skipped", { event: "off", session: agent.id });
		return;
	}
	agent.ctx.effect(() => {
		let text = snapshotText(agent.session) ?? renderSlice(memory);
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;

		/** @purpose Install a new text, or keep the old text when the render gives the same text. */
		const refresh = (trigger: string): void => {
			if (!live) return;
			const next = renderSlice(memory);
			const changed = next !== text;
			if (changed) text = next;
			debug("Snapshot refreshed", {
				event: "refresh",
				trigger,
				changed,
				chars: text.length,
			});
		};
		const arm = (): ReturnType<typeof setTimeout> =>
			setTimeout(
				() => {
					refresh("idle");
					timer = arm();
				},
				idleDelay(agent, memory.config.cacheTtl),
			);
		timer = arm();
		agent.ctx.systemPrompt.context({
			name: CONTEXT_NAME,
			order: CONTEXT_ORDER,
			required: true,
			interpolate: false,
			text: () => text,
		});
		agent.ctx.on("session/event", (session, event) => {
			if (session !== agent.session) return;
			if (compactionSucceeded(event)) {
				refresh("compaction");
				return;
			}
			clearTimeout(timer);
			timer = arm();
		});
		debug("Context registered", {
			event: "register",
			session: agent.id,
			scope: memory.scope,
			chars: text.length,
		});
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, "memlens.context");
}
// #endregion FUNC_registerMemoryContext

// #region FUNC_renderSlice
/**
 * @purpose Render the memory slice of one agent from the store rows.
 * @invariants The directions block holds the visible scopes under the budget, with the
 * top line of each scope. The here block holds the frontier of the active scope.
 * @invariants The render calls no model and reads no configuration file.
 * @param memory - The store, the resolved configuration, and the active scope of the agent.
 * @returns The text of one snapshot.
 */
function renderSlice(memory: AgentMemory): string {
	const { store, config, scope } = memory;
	const visible = visibleScopes(config.profile.scopes, [
		...liveCounts(store).keys(),
	]);
	const data = directionsData(store, visible, config.budget.directions);
	const directions: DirectionLine[] = data.lines.map((line) => ({
		...line,
		summary: topLineText(memory, line.scope),
	}));
	const input: ContextInput = {
		scope,
		here: loadView(store.handle(), scope),
		hereBudget: config.budget.here,
		directions,
		older: data.rest,
		now: nowIso(),
		...(config.customPrompt === null
			? {}
			: { customPrompt: config.customPrompt }),
		...(config.customPromptAppend === null
			? {}
			: { customPromptAppend: config.customPromptAppend }),
	};
	const text = renderContext(input);
	debug("Slice rendered", { event: "render", scope, chars: text.length });
	return text;
}
// #endregion FUNC_renderSlice

/** @purpose Give the top line text of one scope, or null when the scope shows no live note. */
function topLineText(memory: AgentMemory, scope: ScopeKey): string | null {
	const line = topLineOf(loadView(memory.store.handle(), scope));
	return line === null ? null : textOfLine(line);
}

// #region FUNC_snapshotText
/**
 * @purpose Read the Memlens section of the last runtime context message in the session history.
 * @invariants A message with another producer, another form, or no Memlens section gives null.
 * The read takes the derived history, so a replaced message gives no text.
 * @param session - The live session of one agent.
 * @returns The section text, or null when the history holds none.
 */
function snapshotText(session: Agent["session"]): string | null {
	const messages = session.deriveMessages();
	for (const message of messages.toReversed()) {
		const text = sectionText(message.source);
		if (text !== null) {
			debug("Snapshot restored", { event: "restore", chars: text.length });
			return text;
		}
	}
	debug("Snapshot absent", { event: "restore", messages: messages.length });
	return null;
}
// #endregion FUNC_snapshotText

/** The fields of one runtime context source that the harness writes. */
interface SnapshotSource {
	readonly kind?: unknown;
	readonly form?: unknown;
	readonly sections?: readonly {
		readonly name?: unknown;
		readonly text?: unknown;
	}[];
}

/** @purpose Give the Memlens text of one message source, or null. */
function sectionText(source: SnapshotSource): string | null {
	if (source.kind !== "runtime-context" || source.form !== "snapshot")
		return null;
	const text = source.sections?.find(
		(section) => section.name === CONTEXT_NAME,
	)?.text;
	return typeof text === "string" && text.length > 0 ? text : null;
}

// #region FUNC_compactionSucceeded
/**
 * @purpose Tell a successful harness compaction from a failed attempt in the session log.
 * @invariants The event type `compaction/end` closes one compaction transaction, and the
 * field `error` marks a failed attempt.
 * @param event - One session event. The compaction types come from the compaction package.
 * @returns True only for the close event without an error.
 */
function compactionSucceeded(event: {
	readonly type: string;
	readonly data: unknown;
}): boolean {
	if (event.type !== "compaction/end") return false;
	const data = event.data;
	return !(
		typeof data === "object" &&
		data !== null &&
		"error" in data &&
		data.error !== undefined
	);
}
// #endregion FUNC_compactionSucceeded

/** @purpose Give the idle delay of one agent: the cache TTL of its model route, clamped for a timer. */
function idleDelay(
	agent: Agent,
	cacheTtl: AgentMemory["config"]["cacheTtl"],
): number {
	const selection = agent.model.current();
	const route =
		selection === undefined ? "" : `${selection.provider}/${selection.model}`;
	return Math.min(ttlSeconds(cacheTtl, route) * 1000, MAX_TIMER_MS);
}
