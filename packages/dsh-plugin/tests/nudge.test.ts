/**
 * #region moduleContract
 * @purpose Prove the nudge counters, the resets, and the injected line through real Cordis events.
 * @scope The counter rules, the `{n}` text, and the wiring to tool results and turn ends.
 * @invariants Tests emit controlled events and read the injected messages only.
 * #endregion moduleContract
 */

import { tmpdir } from "node:os";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { createScope } from "@deepseek-ai/dsh-scope";
import type {} from "@deepseek-ai/dsh-tools";
import type { ResolvedConfig } from "@memlens/core";
import { describe, expect, it } from "vitest";
import { NudgeCounters, registerMemoryNudge } from "../src/nudge.js";
import type { AgentMemory } from "../src/service.js";

/** The resolved nudge settings of one agent. */
type NudgeSettings = ResolvedConfig["nudge"];

/** One nudge configuration with plain values. */
function nudgeConfig(part: Partial<NudgeSettings> = {}): NudgeSettings {
	return {
		tool_calls: 2,
		turns: 3,
		text: {
			tool_calls: "tools {n} since",
			turns: "turns {n} since",
		},
		...part,
	};
}

/** A fake agent with a real scoped context and a recorded inject box. */
function subject(): { agent: Agent; injected: unknown[] } {
	const injected: unknown[] = [];
	const agent = {} as Agent;
	const scope = createScope(new Context(), agent);
	Object.assign(agent, {
		id: "session-nudge",
		ctx: scope.ctx,
		session: { header: { cwd: tmpdir() } },
		inject: (message: unknown) => injected.push(message),
	});
	return { agent, injected };
}

/** One memory input that carries only the nudge configuration. */
function memory(config: NudgeSettings): AgentMemory {
	return {
		store: {} as AgentMemory["store"],
		config: { nudge: config },
	} as AgentMemory;
}

/** The plain emit of the context, outside the scoped event types. */
const plainEmit = (
	agent: Agent,
): ((name: string, ...args: unknown[]) => void) =>
	agent.ctx.emit as unknown as (name: string, ...args: unknown[]) => void;

/** Emit one tool result on the agent context with branded call ids. */
function emitTool(agent: Agent, name: string, isError: boolean): void {
	plainEmit(agent)(
		"tools/result",
		{
			callId: ToolCallId("call-1"),
			rootCallId: ToolCallId("call-1"),
			name,
			arguments: {},
		},
		{
			isError,
			value: null,
			content: [],
		},
	);
}

describe("NudgeCounters", () => {
	it("runs both counters at the same time", () => {
		const counters = new NudgeCounters(nudgeConfig({ tool_calls: 3 }));
		counters.onToolResult("memory_find", false);
		counters.onTurnEnd();
		counters.onToolResult("memory_open", false);
		expect(counters.current()).toEqual({ toolCalls: 2, turns: 1 });
	});

	it("gives the line of the reached limit with the count in place of {n}", () => {
		const counters = new NudgeCounters(nudgeConfig());
		counters.onToolResult("memory_find", false);
		const lines = counters.onToolResult("memory_open", false);
		expect(lines).toEqual(["tools 2 since"]);
	});

	it("resets both counters after one nudge", () => {
		const counters = new NudgeCounters(nudgeConfig());
		counters.onTurnEnd();
		counters.onTurnEnd();
		counters.onToolResult("memory_find", false);
		expect(counters.onTurnEnd()).toEqual(["turns 3 since"]);
		expect(counters.current()).toEqual({ toolCalls: 0, turns: 0 });
	});

	it("resets both counters after a successful note write", () => {
		const counters = new NudgeCounters(nudgeConfig());
		counters.onToolResult("memory_find", false);
		counters.onTurnEnd();
		expect(counters.onToolResult("memory_note", false)).toEqual([]);
		expect(counters.current()).toEqual({ toolCalls: 0, turns: 0 });
	});

	it("counts a failed note write and each other tool result", () => {
		const counters = new NudgeCounters(nudgeConfig());
		counters.onToolResult("memory_note", true);
		expect(counters.current().toolCalls).toBe(1);
	});

	it("gives no line from a counter with a limit of zero", () => {
		const counters = new NudgeCounters(
			nudgeConfig({ tool_calls: 0, turns: 0 }),
		);
		for (let index = 0; index < 5; index += 1)
			counters.onToolResult("memory_find", false);
		expect(counters.onTurnEnd()).toEqual([]);
		expect(counters.current().toolCalls).toBe(5);
	});
});

describe("registerMemoryNudge", () => {
	it("delivers the line through inject with the memlens-nudge source", () => {
		const { agent, injected } = subject();
		registerMemoryNudge(agent, memory(nudgeConfig()));
		emitTool(agent, "memory_find", false);
		emitTool(agent, "memory_open", false);
		expect(injected).toEqual([
			{
				id: expect.any(String),
				role: "user",
				content: [{ type: "text", text: "tools 2 since" }],
				source: { kind: "memlens-nudge" },
			},
		]);
	});

	it("resets after a note write and nudges again after new calls", () => {
		const { agent, injected } = subject();
		registerMemoryNudge(agent, memory(nudgeConfig()));
		emitTool(agent, "memory_find", false);
		emitTool(agent, "memory_note", false);
		emitTool(agent, "memory_find", false);
		expect(injected).toHaveLength(0);
		emitTool(agent, "memory_open", false);
		expect(injected).toHaveLength(1);
	});

	it("counts an ended turn once per turn end event", () => {
		const { agent, injected } = subject();
		registerMemoryNudge(agent, memory(nudgeConfig()));
		plainEmit(agent)("session/event", agent.session, { type: "turn/end" });
		plainEmit(agent)("session/event", agent.session, { type: "step/start" });
		plainEmit(agent)("session/event", agent.session, { type: "turn/end" });
		expect(injected).toHaveLength(0);
		plainEmit(agent)("session/event", agent.session, { type: "turn/end" });
		expect(injected).toEqual([
			{
				id: expect.any(String),
				role: "user",
				content: [{ type: "text", text: "turns 3 since" }],
				source: { kind: "memlens-nudge" },
			},
		]);
	});

	it("ignores the tool results of other contexts after disposal", async () => {
		const { agent, injected } = subject();
		registerMemoryNudge(agent, memory(nudgeConfig()));
		await agent.ctx.fiber.dispose();
		emitTool(agent, "memory_find", false);
		expect(injected).toHaveLength(0);
	});
});
