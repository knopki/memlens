/**
 * #region moduleContract
 * @purpose Write one note, or store one proposal when a child or an invisible scope cannot write it.
 * @scope The memory_note schema, the scope choice, the supersede targets, the note time, the review time, and
 *  the proposal payload.
 *  NOT: the row rules, the proposal table, and the console.
 * @invariants A child gives a proposal with its session id. A supersede target outside the profile gives NotAllowed.
 * @invariants A call may name the moment of the note, and the store ranks the note by that time.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools; shared.ts
 * @keywords memlens, tool, note, write, supersede, proposal, review
 * #endregion moduleContract
 */

import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
	MemlensError,
	normalizeScopeKey,
	note,
	propose,
	renderAddress,
	type ScopeKey,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	debug,
	KINDS,
	listedInProfile,
	type MemoryNoteInput,
	type MemoryNoteOutput,
	noteTime,
	resolveTarget,
	reviewTime,
} from "./shared.js";

// #region FUNC_noteAnswer
/**
 * @purpose Write one note, or store one proposal when the child or the profile cannot write it.
 * @invariants A child writes a proposal with its session id, and the store makes no record.
 * @invariants A write outside the profile scopes gives a proposal. A supersede target outside them gives NotAllowed.
 */
function noteAnswer(
	agent: Agent,
	memory: AgentMemory,
	child: boolean,
	input: MemoryNoteInput,
): MemoryNoteOutput {
	const kind = input.kind ?? "note";
	const scope =
		input.scope === undefined
			? memory.scope
			: (normalizeScopeKey(input.scope) as ScopeKey);
	const reviewAt = reviewTime(memory, kind, input.reviewIn);
	const ts = noteTime(input.ts);
	const targets = (input.supersedes ?? []).map((target) => {
		const resolved = resolveTarget(memory, scope, target);
		if (!listedInProfile(memory, resolved.scope))
			throw new MemlensError(
				"NotAllowed",
				`The scope ${resolved.scope} is not visible.`,
			);
		return resolved.row;
	});
	const ids = targets.map((row) => row.id);
	const longform =
		input.longform === undefined ? {} : { longform: input.longform };
	if (child || !listedInProfile(memory, scope)) {
		const proposal = propose(memory.store, {
			scope,
			op: "note",
			payload: {
				body: input.body,
				kind,
				scope,
				review_at: reviewAt,
				...longform,
				...(ids.length === 0 ? {} : { supersedes: ids }),
				...(ts === undefined ? {} : { ts }),
				session: agent.id,
			},
		});
		debug("Proposal stored", {
			event: "propose",
			id: proposal.id,
			session: agent.id,
		});
		return { id: proposal.id, proposed: true };
	}
	const saved = note(memory.store, {
		scope,
		body: input.body,
		kind,
		review_at: reviewAt,
		...(ts === undefined ? {} : { ts }),
		session: agent.id,
		turn: "tool",
		preset: agent.session.header.agentPreset ?? "memlens",
		...longform,
		...(ids.length === 0 ? {} : { supersedes: ids }),
	});
	if (!saved.ok) {
		const live = saved.value;
		if (live === undefined)
			throw new MemlensError("Data", "The note is a duplicate.");
		debug("Note duplicate", { event: "duplicate", scope, pos: live.pos });
		return {
			addr: renderAddress(scope, live.pos, null),
			id: live.id,
			state: "live",
		};
	}
	debug("Note saved", { event: "note", scope, pos: saved.value.pos });
	return {
		addr: renderAddress(scope, saved.value.pos, null),
		id: saved.value.id,
		state: "live",
	};
}
// #endregion FUNC_noteAnswer

// #region FUNC_noteTool
/**
 * @purpose Write one note, or store one proposal for a child or an invisible scope.
 */
export function noteTool(
	agent: Agent,
	memory: AgentMemory,
	child: boolean,
): ToolDefinition {
	return defineTool({
		name: "memory_note",
		description:
			"Save one memory note. A write with no scope goes to the active scope. A write outside the profile scopes, and each write of a subagent, becomes a proposal for a human.",
		parameters: {
			body: {
				type: "string",
				required: true,
				description:
					"The note. Keep it to 384 characters; up to 512 characters is accepted.",
			},
			longform: {
				type: "string",
				description: "The long text of the note.",
			},
			scope: {
				type: "string",
				description: "A scope key. The default is the active scope.",
			},
			kind: {
				type: "string",
				enum: KINDS,
				description: "The kind of the note. The default is note.",
			},
			supersedes: {
				type: "array",
				items: { oneOf: [{ type: "number" }, { type: "string" }] },
				description:
					"The records that this note replaces. A target is a pos or an address.",
			},
			reviewIn: {
				type: "string",
				description:
					"The review period as <count>d or never. The default is the period of the kind.",
			},
			ts: {
				type: "string",
				description:
					"The time of the note, as ISO 8601. Give a past moment for a note that records what happened then. The default is the write time.",
			},
		},
		output: {
			schema: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							addr: { type: "string", required: true },
							id: { type: "string", required: true },
							state: { type: "string", const: "live", required: true },
						},
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							id: { type: "string", required: true },
							proposed: { type: "boolean", const: true, required: true },
						},
					},
				],
			},
			render: (args, value) =>
				blocks(
					"proposed" in value
						? `Proposed to your parent: ${args.body} (proposal ${value.id})`
						: `saved ${value.addr}`,
				),
		},
		presentResult(_args, result) {
			const line = result.content
				.map((block) => (block.type === "text" ? block.text : ""))
				.join("\n")
				.split("\n")[0];
			return line?.startsWith("Proposed to your parent:")
				? { card: "generic", title: line }
				: undefined;
		},
		async execute(args) {
			return noteAnswer(agent, memory, child, args);
		},
	});
}
// #endregion FUNC_noteTool
