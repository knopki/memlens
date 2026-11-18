/**
 * #region moduleContract
 * @purpose Count the tool calls and the turns of one agent, and inject the nudge line at the limit.
 * @scope The two counters, the note-write reset, the limit check, and the injected line.
 * @scope NOT: the snapshot, the tools, and the compaction.
 * @invariants A counter counts from the session start, the last nudge, or the last note write.
 * @invariants One nudge resets both counters. A successful note write resets both counters.
 * @invariants The line holds `{n}`, and the count of that counter takes its place.
 * @invariants The line goes through injected context only. The memory snapshot holds none of it.
 * @dependencies USES API: @deepseek-ai/cordis, @memlens/core
 * @keywords nudge, counter, tool_calls, turns, inject, memlens-nudge
 * #endregion moduleContract
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { MessageId } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-tools";
import { type ResolvedConfig, ulid } from "@memlens/core";
import type { AgentMemory } from "./service.js";

/** The resolved nudge settings of one agent. */
type NudgeSettings = ResolvedConfig["nudge"];

declare module "@deepseek-ai/dsh-llm" {
	interface MessageSourceMap {
		/** The nudge line of the memlens plugin. */
		"memlens-nudge": { kind: "memlens-nudge" };
	}
}

/** The name of the write tool that resets the counters. */
const NOTE_TOOL = "memory_note";

// #region CLASS_NudgeCounters
/**
 * @purpose Hold the two counts and give the lines that a limit reached.
 * @invariants A limit of zero or less disables its counter.
 * @invariants A returned line resets both counts, because one nudge restarts both counters.
 */
export class NudgeCounters {
	private toolCalls = 0;
	private turns = 0;

	constructor(public config: NudgeSettings) {}

	/** @returns The counts of both counters, for a check or a test. */
	current(): { readonly toolCalls: number; readonly turns: number } {
		return { toolCalls: this.toolCalls, turns: this.turns };
	}

	/**
	 * @purpose Count one tool result and reset both counts after a successful note write.
	 * @param name - The name of the tool that the model called.
	 * @param failed - Whether the call failed.
	 * @returns The nudge lines of each counter that reached its limit, in order.
	 */
	onToolResult(name: string, failed: boolean): readonly string[] {
		if (name === NOTE_TOOL && !failed) {
			this.toolCalls = 0;
			this.turns = 0;
			return [];
		}
		this.toolCalls += 1;
		return this.lines();
	}

	/**
	 * @purpose Count one ended turn and give the lines of each reached limit.
	 * @returns The nudge lines of each counter that reached its limit, in order.
	 */
	onTurnEnd(): readonly string[] {
		this.turns += 1;
		return this.lines();
	}

	/** Give the line of each reached limit, then reset both counts. */
	private lines(): readonly string[] {
		const lines: string[] = [];
		if (this.reached(this.config.tool_calls, this.toolCalls))
			lines.push(this.line("tool_calls", this.toolCalls));
		if (this.reached(this.config.turns, this.turns))
			lines.push(this.line("turns", this.turns));
		if (lines.length) {
			this.toolCalls = 0;
			this.turns = 0;
		}
		return lines;
	}

	/** A limit of zero or less never fires. */
	private reached(limit: number, count: number): boolean {
		return limit > 0 && count >= limit;
	}

	/** Replace `{n}` with the count of one counter. */
	private line(counter: "tool_calls" | "turns", count: number): string {
		return this.config.text[counter].replaceAll("{n}", String(count));
	}
}
// #endregion CLASS_NudgeCounters

// #region FUNC_registerMemoryNudge
/**
 * @purpose Bind the counters of one agent to its tool results and turn ends.
 * @param agent - The live agent that receives the nudge lines.
 * @param memory - The resolved memory inputs of the agent.
 * @invariants The registration lives on the agent context, so it ends with the agent.
 * @returns The function that removes the listeners.
 */
export function registerMemoryNudge(
	agent: Agent,
	memory: AgentMemory,
): () => void {
	const counters = new NudgeCounters(memory.config.nudge);
	const deliver = (lines: readonly string[]): void => {
		for (const text of lines) {
			agent.inject({
				id: MessageId(ulid(Date.now())),
				role: "user",
				content: [{ type: "text", text }],
				source: { kind: "memlens-nudge" },
			});
		}
	};
	const tools = agent.ctx.on("tools/result", (exec, result) => {
		counters.config = memory.config.nudge;
		deliver(counters.onToolResult(exec.name, result.isError));
	});
	const session = agent.ctx.on("session/event", (_session, event) => {
		if (event.type === "turn/end") {
			counters.config = memory.config.nudge;
			deliver(counters.onTurnEnd());
		}
	});
	return () => {
		tools();
		session();
	};
}
// #endregion FUNC_registerMemoryNudge

/** The host context type that carries the nudge registration. */
export type NudgeContext = Context;
