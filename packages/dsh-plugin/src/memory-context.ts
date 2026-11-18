/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give each agent its memory slice as required runtime context, and hold one text
 * until an accepted trigger asks for a new render.
 * @scope
 *  - The context registration, the restore from the session history, and the refresh trigger.
 *  - NOT: the render of the slice, the snapshot publication, the tools, and the nudge.
 * @invariants
 *  - The provider answers the current text. The provider reads no row.
 *  - A render reads rows only, calls no model, and waits for no summary build.
 *  - The text changes at a fresh session and at a successful compaction.
 *  - A store that is not open registers the context only when the history holds a saved section.
 *    The model learns the state from the tool errors, and the surface shows the state.
 *  - An `off` subagent gets no registration.
 *  - The registration ends with the agent context.
 * @dependencies USES API: @deepseek-ai/cordis, @deepseek-ai/dsh-agent, @deepseek-ai/dsh-system-prompt, @memlens/core
 * @keywords context, snapshot, runtime-context, restore, compaction, subagent
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
	visibleScopes,
} from "@memlens/core";
import type { AgentMemory } from "./service.js";

const debug = debuglog("memlens:plugin:context");

/** The context name. The harness joins the named snapshot sections by this name. */
const CONTEXT_NAME = "memlens";

/** The context order. It comes after the last built-in runtime context. */
const CONTEXT_ORDER = 220;

// #region FUNC_registerMemoryContext
/**
 * @purpose Give one agent its memory slice as required runtime context, and refresh the text
 * at the accepted trigger.
 * @invariants The registration takes no snapshot table and writes no row.
 * @invariants A refresh with the same text keeps the old text.
 * @invariants A store that is not open and a history without a saved section give no
 *   registration. The respawn at the open adds it.
 * @param agent - The live agent that owns the context scope.
 * @param memory - The store, the resolved configuration, and the active scope of the agent.
 * @returns The function that removes the context and its listener.
 */
export function registerMemoryContext(
	agent: Agent,
	memory: AgentMemory,
): () => unknown {
	if (
		agent.session.header.origin === "subagent" &&
		memory.config.profile.subagents === "off"
	) {
		debug("Context skipped", { event: "off", session: agent.id });
		return () => {};
	}
	return agent.ctx.effect(() => {
		const saved = snapshotText(agent.session);
		if (!memory.storeState.ready && saved === null) {
			debug("Context skipped; the store is not open", {
				event: "off-store",
				session: agent.id,
			});
			return () => {};
		}
		let text = saved ?? renderSlice(memory);

		/** @purpose Install a new text, or keep the old text when the render gives the same text. */
		const refresh = (trigger: string): void => {
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
		const removeContext = agent.ctx.systemPrompt.context({
			name: CONTEXT_NAME,
			order: CONTEXT_ORDER,
			required: true,
			interpolate: false,
			text: () => text,
		});
		const removeListener = agent.ctx.on("session/event", (session, event) => {
			if (session !== agent.session) return;
			if (compactionSucceeded(event)) refresh("compaction");
		});
		debug("Context registered", {
			event: "register",
			session: agent.id,
			scope: memory.scope,
			chars: text.length,
		});
		return () => {
			removeContext();
			removeListener();
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
		if (text === null) continue;
		debug("Snapshot restored", { event: "restore", chars: text.length });
		return text;
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
