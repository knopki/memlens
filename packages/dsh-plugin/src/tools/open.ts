/**
 * #region moduleContract
 * @purpose Answer an open call with one record or one range, so the model reads the content of a line.
 * @scope The memory_open schema, the target parse, the longform window, and the child lines.
 *  NOT: the row rules, the longform limits, and the profile check.
 * @invariants A target with no scope names the active scope. A range gives its children.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-tools; shared.ts
 * @keywords memlens, tool, open, address, range, longform, child
 * #endregion moduleContract
 */

import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
	byAddress,
	loadRangeView,
	MemlensError,
	openNote,
	openRange,
	parseAddress,
	type ScopeKey,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import {
	blocks,
	checkedScope,
	type MemoryOpenEntry,
	type MemoryOpenInput,
	type MemoryOpenOutput,
} from "./shared.js";

// #region FUNC_entryAnswer
/**
 * @purpose Answer an open call for one record with the visible part of its longform.
 * @invariants The answer keeps the fields of the declared entry type and drops the rest.
 */
function entryAnswer(
	memory: AgentMemory,
	scope: ScopeKey,
	pos: number,
	mode: "none" | "head" | "all",
	offset: number,
): MemoryOpenEntry {
	const record = byAddress(memory.store, scope, pos);
	if (record === null)
		throw new MemlensError("Data", `No record of ${scope} is at ${pos}.`);
	const entry = openNote(scope, record, mode, offset);
	return {
		kind: "entry",
		addr: entry.addr,
		pos: entry.pos,
		id: entry.id,
		ts: entry.ts,
		scope: entry.scope,
		body: entry.body,
		...(entry.longform === undefined ? {} : { longform: entry.longform }),
		longformChars: entry.longformChars,
		longformOffset: entry.longformOffset,
		longformTruncated: entry.longformTruncated,
		review_at: entry.review_at,
		refs: [...entry.refs],
	};
}
// #endregion FUNC_entryAnswer

// #region FUNC_openAnswer
/**
 * @purpose Answer an open call for one record, one range, or one `pos` of the active scope.
 * @invariants A target with no scope names the active scope. A target with a scope names the scope of that scope.
 */
function openAnswer(
	memory: AgentMemory,
	input: MemoryOpenInput,
): MemoryOpenOutput {
	const active = checkedScope(memory, memory.scope);
	if (typeof input.target === "number")
		return entryAnswer(
			memory,
			active,
			input.target,
			input.longform ?? "head",
			input.offset ?? 0,
		);
	const address = parseAddress(input.target);
	if (address === null)
		throw new MemlensError(
			"Usage",
			`The target ${input.target} is not an address.`,
		);
	const scope =
		address.scope === null ? active : checkedScope(memory, address.scope);
	if (address.kind === "range" || address.kind === "scoped-range")
		return {
			kind: "children",
			children: openRange(
				scope,
				loadRangeView(memory.store, scope),
				address.start,
				address.end,
			).children.map((line) => ({ ...line })),
		};
	return entryAnswer(
		memory,
		scope,
		address.pos,
		input.longform ?? "head",
		input.offset ?? 0,
	);
}
// #endregion FUNC_openAnswer

/** The fields of one record that its text answer reads. */
interface EntryText {
	readonly addr: string;
	readonly ts: string;
	readonly review_at: string | null;
	readonly body: string;
	readonly longform?: string;
	readonly longformChars: number;
	readonly longformOffset: number;
}

/** The text answer of one record. */
function entryText(entry: EntryText): string {
	const head = `${entry.addr}  ${entry.ts.slice(0, 10)}  review ${entry.review_at ?? "never"}`;
	const document =
		entry.longform === undefined
			? ""
			: `\n--- longform ${entry.longformChars} chars, next offset ${entry.longformOffset} ---\n${entry.longform}`;
	return `${head}\n${entry.body}${document}`;
}

// #region FUNC_openTool
/**
 * @purpose Answer an open call with one record, one range, or the two children of a node.
 */
export function openTool(memory: AgentMemory): ToolDefinition {
	return defineTool({
		name: "memory_open",
		description:
			"Open one memory record or one range. A target is an address as scope#pos, a pos of the active scope, or a range as pos-pos. A record gives its longform, and a range gives its two children.",
		parameters: {
			target: {
				oneOf: [{ type: "string" }, { type: "number" }],
				required: true,
				description:
					"An address as scope#pos, a pos of the active scope, or a range as pos-pos.",
			},
			longform: {
				type: "string",
				enum: ["none", "head", "all"],
				description: "The part of the longform. The default is head.",
			},
			offset: {
				type: "number",
				description: "The first character of the longform.",
			},
		},
		output: {
			schema: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { type: "string", const: "entry", required: true },
							addr: { type: "string", required: true },
							pos: { type: "number", required: true },
							id: { type: "string", required: true },
							ts: { type: "string", required: true },
							scope: { type: "string", required: true },
							body: { type: "string", required: true },
							longform: { type: "string" },
							longformChars: { type: "number", required: true },
							longformOffset: { type: "number", required: true },
							longformTruncated: { type: "boolean", required: true },
							review_at: {
								oneOf: [{ type: "string" }, { type: "null" }],
								required: true,
							},
							refs: {
								type: "array",
								items: { type: "string" },
								required: true,
							},
						},
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { type: "string", const: "children", required: true },
							children: {
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
					value.kind === "entry"
						? entryText(value)
						: value.children.length === 0
							? "The range holds no record."
							: value.children
									.map(
										(line) =>
											`${line.addr}  ${line.ts_from}..${line.ts_to}  ${line.built ? line.text : "(no summary yet)"}`,
									)
									.join("\n"),
				),
		},
		async execute(args) {
			return openAnswer(memory, args);
		},
	});
}
// #endregion FUNC_openTool
