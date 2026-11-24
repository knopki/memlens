/**
 * #region moduleContract
 * @purpose Give the due records, or set the next review time of the given records.
 * @scope The memory_review schema, the due list, the target read, and the review write.
 *  NOT: the review rows, the due rule, and the console.
 * @invariants A numeric target needs a scope. A target outside the profile gives NotAllowed.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools
 * @keywords memlens, tool, review, due, next, scope
 * #endregion moduleContract
 */

import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import { dueRecords, MemlensError, nowIso, review } from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	checkedScope,
	debug,
	type MemoryReviewInput,
	type MemoryReviewOutput,
	resolveTarget,
	reviewTime,
	visibleScopeList,
} from "./shared.js";

// #region FUNC_reviewAnswer
/**
 * @purpose Give the due records of the profile, or set the next review time of each target.
 * @invariants A numeric target needs a scope. A target outside the profile scopes gives NotAllowed.
 * @invariants The answer names the count and the next time, or gives no such field.
 */
function reviewAnswer(
	memory: AgentMemory,
	input: MemoryReviewInput,
): MemoryReviewOutput {
	const scope =
		input.scope === undefined ? null : checkedScope(memory, input.scope);
	if (input.reviewed === undefined || input.reviewed.length === 0) {
		const due = dueRecords(
			memory.store,
			scope === null ? visibleScopeList(memory) : [scope],
			nowIso(),
		);
		debug("Review listed", { event: "review", due: due.length });
		return { due: due.map((row) => ({ ...row })) };
	}
	const next: string[] = [];
	for (const target of input.reviewed) {
		if (typeof target === "number" && scope === null)
			throw new MemlensError("Usage", "A numeric review target needs a scope.");
		const resolved = resolveTarget(memory, scope ?? memory.scope, target);
		const reviewAt = reviewTime(memory, resolved.kind, input.reviewIn);
		review(memory.store, resolved.id, reviewAt);
		if (reviewAt !== null) next.push(reviewAt);
	}
	next.sort();
	debug("Review written", {
		event: "review-mark",
		reviewed: input.reviewed.length,
	});
	return { reviewed: input.reviewed.length, next: next[0] ?? "" };
}
// #endregion FUNC_reviewAnswer

// #region FUNC_reviewTool
/**
 * @purpose List the due records of the profile, or set the next review time of each target.
 */
export function reviewTool(memory: AgentMemory): ToolDefinition {
	return defineTool({
		name: "memory_review",
		description:
			"List the memory notes that are due, or set the next review time of the given notes. Review only at a user request.",
		parameters: {
			scope: {
				type: "string",
				description: "The scope of the list or of a numeric target.",
			},
			reviewed: {
				type: "array",
				items: { oneOf: [{ type: "number" }, { type: "string" }] },
				description:
					"The reviewed records. A target is an address, or a pos with a scope.",
			},
			reviewIn: {
				type: "string",
				description:
					"The next review period as <count>d or never. The default is the period of the kind.",
			},
		},
		output: {
			schema: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							due: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										addr: { type: "string", required: true },
										scope: { type: "string", required: true },
										pos: { type: "number", required: true },
										ts: {
											type: "string",
											description: "The day of the note, as YYYY-MM-DD.",
											required: true,
										},
										kind: { type: "string", required: true },
										body: { type: "string", required: true },
										review_at: {
											oneOf: [{ type: "string" }, { type: "null" }],
											description:
												"The day of the next review, as YYYY-MM-DD, or null.",
											required: true,
										},
									},
								},
							},
						},
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							reviewed: { type: "number", required: true },
							next: {
								type: "string",
								description:
									"The day of the next review, as YYYY-MM-DD. An empty value means never.",
								required: true,
							},
						},
					},
				],
			},
			render: (_args, value) =>
				blocks(
					"reviewed" in value
						? `reviewed ${value.reviewed} records, next ${value.next === "" ? "never" : value.next}`
						: value.due.length === 0
							? "No record is due."
							: value.due
									.map(
										(row) =>
											`${row.addr}  ${row.review_at ?? "never"}  ${row.kind}  ${row.body}`,
									)
									.join("\n"),
				),
		},
		async execute(args) {
			return reviewAnswer(memory, args);
		},
	});
}
// #endregion FUNC_reviewTool
