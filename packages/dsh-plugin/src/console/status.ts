/**
 * #region moduleContract
 * @purpose Answer the host state of one surface, so the tab states the snapshot timing and the
 *   console states the compaction state that the standalone console cannot hold.
 * @scope
 *  - The session snapshot facts, the local snapshot tracker, and the compaction state read.
 *  - NOT: the render of the slice, the snapshot publication, and the compaction rules.
 * @invariants The tracker reads live session events only. A resumed session gives no
 *   materialization time until its next snapshot.
 * @invariants The saved state comes from the derived history. The materialization time comes from
 *   the event time. The plugin sets, starts, or changes no timer.
 * @dependencies USES API: @memlens/core, @deepseek-ai/cordis, scope.ts, worker.ts, ../service.ts
 * @keywords console, status, snapshot, materialization, trigger, compaction, backoff
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ScopeKey } from "@memlens/core";
import { toIso } from "@memlens/core";
import type { MemoryWorker, WorkerStatus } from "../worker.js";
import type { ConsoleRequest } from "./scope.js";

const debug = debuglog("memlens:plugin:console");

/** The producer name of a runtime-context message. */
const SOURCE = "runtime-context";

/** The context name of the Memlens snapshot section. */
const SECTION = "memlens";

/** The session facts that the tracker holds between requests. */
interface SnapshotState {
	/** Epoch milliseconds of the last Memlens snapshot message, or zero. */
	snapshotAt: number;
}

/** The fields of one runtime-context message source that the tracker reads. */
interface SnapshotSource {
	readonly kind?: unknown;
	readonly form?: unknown;
	readonly sections?: readonly {
		readonly name?: unknown;
		readonly text?: unknown;
	}[];
}

/** One session snapshot answer. */
export interface SnapshotAnswer {
	/** True when the derived history holds a Memlens snapshot section. */
	readonly saved: boolean;

	/** The character count of that section. */
	readonly chars: number;

	/** The time of the last snapshot message, or null. */
	readonly materializedAt: string | null;
}

/**
 * One status answer of the plugin host.
 * A profile surface holds the compaction state only, because it has no session.
 */
export interface StatusAnswer {
	readonly session?: string;
	readonly scope: ScopeKey;
	readonly snapshot?: SnapshotAnswer;
	readonly compaction: WorkerStatus;
}

/** The session facts of each live session. The map releases a session with its object. */
const states = new WeakMap<object, SnapshotState>();

// #region FUNC_snapshotChars
/**
 * @purpose Give the character count of the Memlens section of one message source, or null.
 * @invariants A source with another producer, another form, or no section gives null.
 * @param source - The source of one derived session message.
 */
function snapshotChars(source: unknown): number | null {
	if (typeof source !== "object" || source === null) return null;
	const { kind, form, sections } = source as SnapshotSource;
	if (kind !== SOURCE || form !== "snapshot") return null;
	const text = sections?.find((section) => section.name === SECTION)?.text;
	return typeof text === "string" && text.length > 0 ? text.length : null;
}
// #endregion FUNC_snapshotChars

// #region FUNC_trackSnapshots
/**
 * @purpose Keep the event time of each session, so the tab states when its snapshot was made.
 * @invariants The tracker ends with the context that owns it. A session object that no request
 *   names costs no memory.
 * @param ctx - The context that owns the listener.
 * @returns The disposer of the listener.
 */
export function trackSnapshots(ctx: Context): () => void {
	debug("Snapshot tracker start", { event: "track" });
	return ctx.on("session/event", (session, event) => {
		if (event.type !== "user/message") return;
		const source = (event.data as { readonly source?: unknown }).source;
		if (snapshotChars(source) === null) return;
		states.set(session, { snapshotAt: event.time });
	});
}
// #endregion FUNC_trackSnapshots

// #region FUNC_savedSnapshot
/**
 * @purpose Read the Memlens section of the last runtime-context message in the session history.
 * @invariants The read takes the derived history, so a replaced message gives no text.
 * @param agent - The live agent of the request.
 */
function savedSnapshot(agent: Agent): { saved: boolean; chars: number } {
	const messages = agent.session.deriveMessages();
	for (const message of messages.toReversed()) {
		const chars = snapshotChars(message.source);
		if (chars !== null) return { saved: true, chars };
	}
	return { saved: false, chars: 0 };
}
// #endregion FUNC_savedSnapshot

// #region FUNC_statusAnswer
/**
 * @purpose Answer the snapshot and compaction state of one session.
 * @invariants The answer names the session of the request and the scope that the transport
 *   resolved. The compaction state reads the local worker only.
 * @param request - The resolved console request.
 * @param worker - The background compaction worker of the host.
 */
export function statusAnswer(
	request: ConsoleRequest,
	worker: MemoryWorker,
): StatusAnswer {
	const { agent, memory, scope } = request;
	const compaction = worker.status();
	if (agent === undefined) {
		debug("Status answered for a profile", {
			event: "status",
			profile: memory.config.defaultProfile,
			dirty: compaction.dirty,
		});
		return { scope, compaction };
	}
	const saved = savedSnapshot(agent);
	const state = states.get(agent.session);
	const answer: StatusAnswer = {
		session: agent.id,
		scope,
		snapshot: {
			saved: saved.saved,
			chars: saved.chars,
			materializedAt: state?.snapshotAt ? toIso(state.snapshotAt) : null,
		},
		compaction,
	};
	debug("Status answered", {
		event: "status",
		session: agent.id,
		saved: saved.saved,
		dirty: compaction.dirty,
	});
	return answer;
}
// #endregion FUNC_statusAnswer
