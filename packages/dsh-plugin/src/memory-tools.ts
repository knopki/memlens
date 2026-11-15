/**
 * #region moduleContract
 * @purpose Give one agent its memory tools, so the model reads and writes the memory through the store rules.
 * @scope
 *  - The tool set of each agent mode, the registration in the agent scope, and the parent report of a child.
 *  - NOT: the tool schemas and their answers, the store rules, the memory context, and the console.
 * @invariants
 *  - The main agent gets six tools. A propose child gets four, a read child gets three, and an off child gets none.
 *  - No child gets memory_forget or memory_review.
 *  - Each registration unwinds with the agent context, and a late report reads no closed store.
 * @usecases
 *  - Child write: subagent => gives one note => gets a proposal id for its parent
 *  - Parent report: child disposal => reads its open proposals => injects one line for each into the parent
 * @dependencies
 *  USES API: @deepseek-ai/dsh-tools, @deepseek-ai/dsh-llm
 *  READS: agent.session.header
 *  WRITES: the parent inbox
 * @keywords memlens, tools, subagent, proposal, report, scope, registration
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
	MemlensError,
	type Proposal,
	pending,
	type SubagentMode,
} from "@memlens/core";
import type { AgentMemory } from "./service.js";
import { findTool } from "./tools/find.js";
import { forgetTool } from "./tools/forget.js";
import { mapTool } from "./tools/map.js";
import { noteTool } from "./tools/note.js";
import { openTool } from "./tools/open.js";
import { reviewTool } from "./tools/review.js";

const debug = debuglog("memlens:plugin:tools");

/** The six tool names, in the order of the tool types. */
const TOOL_NAMES = [
	"memory_note",
	"memory_find",
	"memory_open",
	"memory_forget",
	"memory_review",
	"memory_map",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

// #region FUNC_payloadOf
/**
 * @purpose Read the JSON payload of one proposal as a record of unknown fields.
 * @invariants A payload that is not a JSON object gives an empty record.
 */
function payloadOf(proposal: Proposal): Record<string, unknown> {
	try {
		const data: unknown = JSON.parse(proposal.payload);
		return typeof data === "object" && data !== null
			? (data as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
// #endregion FUNC_payloadOf

// #region FUNC_reportProposals
/**
 * @purpose Send the open proposals of one child to its parent, so the parent decides each next write.
 * @invariants Each line holds the session tag, the proposal id, and the body.
 * @invariants An absent parent, a closed store, or a proposal with no body gives no error.
 * @param agent - The child agent that ends.
 * @param memory - The store that holds the proposals of the child.
 * @param child - True for a subagent. A main agent sends no report.
 */
function reportProposals(
	agent: Agent,
	memory: AgentMemory,
	child: boolean,
): void {
	const header = agent.session.header;
	const parentId = header.parentSession;
	if (!child || parentId === undefined) return;
	try {
		const parent = agent.ctx.root.get("agents")?.get(parentId);
		if (parent === undefined) return;
		const lines = pending(memory.store).flatMap((proposal) => {
			const payload = payloadOf(proposal);
			return payload.session === agent.id
				? [
						`[memory proposals from ${agent.id}] ${proposal.id} ${String(payload.body ?? "")}`,
					]
				: [];
		});
		if (lines.length === 0) return;
		parent.inject(
			createUserMessage({
				content: [{ type: "text", text: lines.join("\n") }],
				source: {
					kind: "memlens",
					form: "notice",
					summary: `${lines.length} memory proposals from a subagent`,
				},
			}),
		);
		debug("Proposals reported", {
			event: "report",
			session: agent.id,
			lines: lines.length,
		});
	} catch (error) {
		debug("Proposal report skipped", {
			event: "report-skip",
			session: agent.id,
			error: String(error),
		});
	}
}
// #endregion FUNC_reportProposals

// #region FUNC_toolNames
/**
 * @purpose Give the tool set of one agent from its subagent state and its mode.
 * @invariants The main agent gets all six tools. A read child gets three, and an off child gets none.
 * @invariants No child gets memory_forget or memory_review.
 * @param child - True for a subagent.
 * @param mode - The subagent mode of the profile.
 * @returns The tool names of the agent, in the order of the tool types.
 */
function toolNames(child: boolean, mode: SubagentMode): readonly ToolName[] {
	if (!child) return TOOL_NAMES;
	if (mode === "off") return [];
	return mode === "read"
		? ["memory_find", "memory_open", "memory_map"]
		: ["memory_find", "memory_open", "memory_note", "memory_map"];
}
// #endregion FUNC_toolNames

// #region FUNC_toolOf
/**
 * @purpose Build one tool definition with its schema, its answer, and its renderer.
 * @param name - The tool name of the set of the agent.
 * @param agent - The agent that owns the tool and its session.
 * @param memory - The store, the profile, and the active scope of the agent.
 * @param child - True for a subagent, whose write is a proposal.
 * @returns The definition to register in the scope of the agent.
 */
function toolOf(
	name: ToolName,
	agent: Agent,
	memory: AgentMemory,
	child: boolean,
): ToolDefinition {
	switch (name) {
		case "memory_find":
			return findTool(memory);
		case "memory_open":
			return openTool(memory);
		case "memory_map":
			return mapTool(memory);
		case "memory_note":
			return noteTool(agent, memory, child);
		case "memory_forget":
			return forgetTool(agent, memory);
		case "memory_review":
			return reviewTool(memory);
	}
}
// #endregion FUNC_toolOf

// #region FUNC_registerMemoryTools
/**
 * @purpose Give one agent its memory tools inside the agent scope.
 * @requires The agent context holds the tools service.
 * @ensures Each registration unwinds with the agent context.
 * @ensures A child subagent sends its open proposals to its parent when it ends.
 * @param agent - The agent that receives the tools.
 * @param memory - The store, the profile, and the active scope of the agent.
 * @param report - True when tool removal must report child proposals.
 * @returns The function that removes the tools and reports child proposals.
 */
export function registerMemoryTools(
	agent: Agent,
	memory: AgentMemory,
	report: () => boolean = () => true,
): () => unknown {
	const tools = agent.ctx.get("tools");
	if (tools === undefined)
		throw new MemlensError("Data", "The tools service is not available.");
	const child = agent.session.header.origin === "subagent";
	const mode = memory.config.profile.subagents ?? "propose";
	const names = toolNames(child, mode);
	if (names.length === 0) {
		debug("No tool for the agent", { event: "register", session: agent.id });
		return () => {};
	}
	return agent.ctx.effect(() => {
		const disposers = names.map((name) =>
			tools.register(toolOf(name, agent, memory, child)),
		);
		debug("Tools registered", {
			event: "register",
			session: agent.id,
			child,
			count: names.length,
		});
		return () => {
			for (const dispose of disposers) dispose();
			if (report()) reportProposals(agent, memory, child);
			debug("Tools removed", { event: "dispose", session: agent.id });
		};
	});
}
// #endregion FUNC_registerMemoryTools

declare module "@deepseek-ai/dsh-llm" {
	interface MessageSourceMap {
		/** The proposals of a subagent, reported to its parent. */
		memlens: {
			kind: "memlens";
			form: "notice";
			summary: string;
		};
	}
}
