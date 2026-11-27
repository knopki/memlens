/**
 * #region moduleContract
 * @modulecontract
 * @purpose Answer a find call from the index, so the model reads the notes that match its words.
 * @scope The memory_find schema, the scope choice, the filters, and the hit answer.
 *  NOT: the index rules, the profile check, and the registration.
 * @invariants A scope outside the profile gives NotAllowed, and the profile hides each other scope.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools
 * @keywords memlens, tool, find, search, scope, hit
 * #endregion moduleContract
 */

import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
	FIND_DEFAULT_LIMIT,
	type FindFilter,
	NOTE_KINDS,
	nowIso,
	search,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	checkedScope,
	debug,
	type MemoryFindInput,
	type MemoryFindOutput,
	visibleScopeList,
} from "./shared.js";

// #region FUNC_findAnswer
/**
 * @purpose Answer a find call from the index of each selected scope.
 * @invariants The profile hides each scope that the call does not name, and a named foreign scope gives NotAllowed.
 * @invariants An absent scope list takes each visible scope, and an empty visible list gives no hit.
 * Each filter of the call cuts the rows before the limit.
 */
function findAnswer(
	memory: AgentMemory,
	input: MemoryFindInput,
): MemoryFindOutput {
	const scopes =
		input.scopes === undefined || input.scopes.length === 0
			? visibleScopeList(memory)
			: input.scopes.map((raw) => checkedScope(memory, raw));
	if (scopes.length === 0) {
		debug("Find refused", { event: "find", hits: 0, scopes: 0 });
		return { hits: [] };
	}
	const filter: FindFilter = {
		query: input.query ?? null,
		scopes,
		since: input.since ?? null,
		until: input.until ?? null,
		kinds: input.kinds ?? null,
		due: input.due === true,
		limit: input.limit ?? FIND_DEFAULT_LIMIT,
	};
	const found = search(memory.store, filter, nowIso());
	debug("Find answered", { event: "find", hits: found.length });
	return { hits: found.map((hit) => ({ ...hit })) };
}
// #endregion FUNC_findAnswer

// #region FUNC_findTool
/**
 * @purpose Answer a find call from the index of each visible scope.
 */
export function findTool(memory: AgentMemory): ToolDefinition {
	return defineTool({
		name: "memory_find",
		description:
			"Find memory notes by words. Each word must match, and a word with a leading minus is excluded. An empty query gives the newest notes. Each hit gives its address as scope#pos.",
		parameters: {
			query: {
				type: "string",
				description: "The words. An empty query gives the newest notes.",
			},
			scopes: {
				type: "array",
				items: { type: "string" },
				description: "The scopes. The default is each visible scope.",
			},
			since: {
				type: "string",
				description: "The first date, as YYYY-MM-DD.",
			},
			until: {
				type: "string",
				description: "The last date, as YYYY-MM-DD.",
			},
			kinds: {
				type: "array",
				items: { type: "string", enum: [...NOTE_KINDS] },
				description: "The kinds of the notes.",
			},
			due: {
				type: "boolean",
				description: "Keep only the notes that are due for review.",
			},
			limit: {
				type: "number",
				description:
					"The greatest count of hits. The default is 10. The answer never holds more than 50 hits.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					hits: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								addr: { type: "string", required: true },
								scope: { type: "string", required: true },
								pos: { type: "number", required: true },
								id: { type: "string", required: true },
								ts: {
									type: "string",
									description: "The day of the note, as YYYY-MM-DD.",
									required: true,
								},
								kind: { type: "string", required: true },
								body: { type: "string", required: true },
								longformChars: { type: "number", required: true },
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
			render: (_args, value) =>
				blocks(
					value.hits.length === 0
						? "No hit."
						: value.hits
								.map(
									(hit) => `${hit.addr}  ${hit.ts}  ${hit.kind}  ${hit.body}`,
								)
								.join("\n"),
				),
		},
		async execute(args) {
			return findAnswer(memory, args);
		},
	});
}
// #endregion FUNC_findTool
