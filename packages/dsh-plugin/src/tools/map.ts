/**
 * #region moduleContract
 * @purpose Answer a map call with the visible scopes or the frontier of one scope, so the model finds a next step.
 * @scope The memory_map schema, the direction lines, the frontier lines, and the budget.
 *  NOT: the slice render, the profile check, and the active scope.
 * @invariants The answer sets no active scope and takes the field `scope` only.
 * @invariants The first scope line holds the scopes outside the directions budget, and its text is empty.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools; shared.ts
 * @keywords memlens, tool, map, scope, direction, frontier, slice
 * #endregion moduleContract
 */

import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
	directionsData,
	loadRangeView,
	renderAddress,
	type ScopeKey,
	sliceOf,
	textOfLine,
	topLineOf,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	checkedScope,
	debug,
	type MemoryDirectionLine,
	type MemoryMapInput,
	type MemoryMapOutput,
	type MemoryOpenLine,
	visibleScopeList,
} from "./shared.js";

// #region FUNC_sliceAnswer
/**
 * @purpose Give one frontier line of a scope as the declared line type.
 * @invariants A record gives its body. A clean node gives its summary. Another range gives the joined text.
 */
function sliceAnswer(
	scope: ScopeKey,
	line: ReturnType<typeof sliceOf>[number],
): MemoryOpenLine {
	if (line.kind === "record")
		return {
			addr: renderAddress(scope, line.pos, null),
			ts_from: line.from,
			ts_to: line.to,
			text: line.body,
			built: true,
			chars: line.body.length,
		};
	const text = line.kind === "summary" ? line.summary : line.text;
	return {
		addr: renderAddress(
			scope,
			line.range.start,
			line.range.start + 2 ** line.range.level - 1,
		),
		ts_from: line.from,
		ts_to: line.to,
		text,
		built: line.kind === "summary",
		chars: text.length,
	};
}
// #endregion FUNC_sliceAnswer

// #region FUNC_directionAnswers
/**
 * @purpose Give the direction lines of the visible scopes, as the directions block renders them.
 * @invariants The older scopes outside the budget join one line, from the newest to the oldest.
 * @invariants Each budgeted scope gives one line from the oldest to the newest, with its summary text.
 */
function directionAnswers(memory: AgentMemory): MemoryDirectionLine[] {
	const scopes = visibleScopeList(memory);
	const data = directionsData(memory.store, scopes, scopes.length);
	const budget = Math.max(0, memory.config.budget.directions);
	const split = Math.max(0, data.lines.length - budget);
	const older = data.lines.slice(0, split);
	const shown = data.lines.slice(split);
	const lines: MemoryDirectionLine[] = [];
	if (older.length > 0)
		lines.push({
			keys: older.map((line) => line.scope).reverse(),
			ts_from: older[0]?.lastWrite ?? "",
			ts_to: older[older.length - 1]?.lastWrite ?? "",
			text: "",
		});
	for (const line of shown) {
		const top = topLineOf(loadRangeView(memory.store, line.scope));
		lines.push({
			keys: [line.scope],
			ts_from: line.lastWrite,
			ts_to: line.lastWrite,
			text: top === null ? "" : textOfLine(top),
		});
	}
	debug("Map answered", {
		event: "map",
		scopes: shown.length,
		older: older.length,
	});
	return lines;
}
// #endregion FUNC_directionAnswers

// #region FUNC_mapAnswer
/**
 * @purpose Answer a map call with the scope lines or the frontier lines of one scope.
 * @invariants The call sets no active scope and takes no other field.
 */
function mapAnswer(
	memory: AgentMemory,
	input: MemoryMapInput,
): MemoryMapOutput {
	if (input.scope === undefined)
		return { kind: "scopes", lines: directionAnswers(memory) };
	const scope = checkedScope(memory, input.scope);
	const view = loadRangeView(memory.store, scope);
	return {
		kind: "scope",
		scope,
		lines: sliceOf(view, memory.config.budget.here).map((line) =>
			sliceAnswer(scope, line),
		),
	};
}
// #endregion FUNC_mapAnswer

// #region FUNC_mapTool
/**
 * @purpose Answer a map call with the scope lines or the frontier lines of one scope.
 */
export function mapTool(memory: AgentMemory): ToolDefinition {
	return defineTool({
		name: "memory_map",
		description:
			"List the visible scopes with their last write and summary, or give the frontier lines of one scope. A scope outside the profile gives an error.",
		parameters: {
			scope: {
				type: "string",
				description: "A scope key. The default is the list of the scopes.",
			},
		},
		output: {
			schema: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { type: "string", const: "scopes", required: true },
							lines: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										keys: {
											type: "array",
											items: { type: "string" },
											required: true,
										},
										ts_from: { type: "string", required: true },
										ts_to: { type: "string", required: true },
										text: { type: "string", required: true },
									},
								},
							},
						},
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { type: "string", const: "scope", required: true },
							scope: { type: "string", required: true },
							lines: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										addr: { type: "string", required: true },
										ts_from: { type: "string", required: true },
										ts_to: { type: "string", required: true },
										text: { type: "string", required: true },
										built: { type: "boolean", required: true },
										chars: { type: "number", required: true },
									},
								},
							},
						},
					},
				],
			},
			render: (_args, value) =>
				blocks(
					value.kind === "scopes"
						? value.lines
								.map((line) =>
									line.keys.length > 1
										? `[${line.keys.join(",")}]`
										: `[${line.keys[0] ?? ""}]  ${line.ts_to.slice(0, 10)}  ${line.text}`,
								)
								.join("\n")
						: value.lines
								.map(
									(line) =>
										`${line.addr}  ${line.ts_from}..${line.ts_to}  ${line.built ? line.text : "(no summary yet)"}`,
								)
								.join("\n"),
				),
		},
		async execute(args) {
			return mapAnswer(memory, args);
		},
	});
}
// #endregion FUNC_mapTool
