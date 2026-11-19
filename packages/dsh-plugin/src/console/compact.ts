/**
 * #region moduleContract
 * @purpose Give the tab one compaction job and write its answers, so a user compacts the memory
 *   from the console.
 * @scope
 *  - The actions compact and compact-answer, the copy and join publication, the answer parse, and
 *    the answer apply.
 *  - NOT: the merge text rules of the core and the store transactions.
 * @usecases
 *  - Job: tab => presses compact => gets the merge inputs of one scope
 * @invariants The job publishes each fitting copy and join with no model call. The store checks the
 *   input under the write lock, and a changed input counts as rejected.
 * @dependencies USES API: @memlens/core
 * @keywords console, compact, merge, answer, node, job
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { BuildChild, BuildInput, ScopeKey } from "@memlens/core";
import {
	answerLine,
	batchTask,
	candidates,
	copyBuild,
	joinBuild,
	MemlensError,
	NODE_TARGET,
	publishJoin,
	publishNode,
	readBuild,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import { visibleScopeList } from "../tools/shared.js";
import { type ConsoleRequest, text } from "./scope.js";

const debug = debuglog("memlens:plugin:console");

/** The greatest count of merge inputs of one job. */
const MAX_INPUTS = 50;

// #region INTERFACE_Answer
/** One parsed answer line: the range, its address, and the answer text. */
export interface Answer {
	readonly addr: string;
	readonly range: { readonly start: number; readonly level: number };
	readonly text: string;
}
// #endregion INTERFACE_Answer

/** One captured build input with the keys that the publication checks. */
interface Captured {
	readonly read: Extract<ReturnType<typeof readBuild>, { ok: true }>;
	readonly input: BuildInput;
}

// #region FUNC_buildInput
/**
 * @purpose Read the current build input of one candidate range, or null when a half is empty.
 */
function buildInput(
	memory: AgentMemory,
	scope: ScopeKey,
	range: { level: number; start: number },
): Captured | null {
	const read = readBuild(memory.store, scope, range.level, range.start);
	if (!read.ok) return null;
	const width = 2 ** (range.level - 1);
	const child = (
		text: string | null,
		key: string | null,
		start: number,
	): BuildChild | null => {
		if (text === null) return null;
		if (range.level === 1)
			return {
				kind: "record",
				id: key ?? "",
				pos: start,
				body: text,
				preview:
					start === range.start ? (read.aPreview ?? "") : (read.bPreview ?? ""),
				ts: start === range.start ? read.tsFrom : read.tsTo,
			};
		return {
			kind: "node",
			id: key ?? "",
			range: { start, level: range.level - 1 },
			summary: text,
			ts_from: read.tsFrom,
			ts_to: read.tsTo,
		};
	};
	return {
		read,
		input: {
			range,
			children: [
				child(read.aText, read.aKey, range.start),
				child(read.bText, read.bKey, range.start + width),
			],
		},
	};
}
// #endregion FUNC_buildInput

// #region FUNC_readyInputs
/** Each candidate range of one scope with its current build input. */
function readyInputs(
	memory: AgentMemory,
	scope: ScopeKey,
): readonly Captured[] {
	return candidates(memory.store, scope).flatMap((range) => {
		const result = buildInput(memory, scope, range);
		return result ? [result] : [];
	});
}
// #endregion FUNC_readyInputs

// #region FUNC_publishRounds
/**
 * @purpose Publish each fitting join and copy in rounds until one round publishes nothing.
 * @invariants One run completes each join chain, so the merge inputs come from the last round.
 */
function publishRounds(
	memory: AgentMemory,
	scope: ScopeKey,
): { readonly published: number; readonly joined: number } {
	let published = 0;
	let joined = 0;
	for (let round = 1; ; round += 1) {
		const pending = readyInputs(memory, scope);
		let accepted = 0;
		let roundJoins = 0;
		for (const { input, read } of pending) {
			const [left, right] = input.children;
			const joinedLine = left && right ? joinBuild(input) : null;
			if (joinedLine) {
				if (
					publishJoin(
						memory.store,
						scope,
						input.range.level,
						input.range.start,
						read,
					).ok
				) {
					accepted += 1;
					roundJoins += 1;
				}
			} else if ((!left || !right) && read.fits) {
				const line = copyBuild(input);
				if (
					publishNode(
						memory.store,
						scope,
						input.range.level,
						input.range.start,
						line.summary,
						read,
					).ok
				)
					accepted += 1;
			}
		}
		published += accepted;
		joined += roundJoins;
		debug("Mechanical round", {
			event: "round",
			round,
			found: pending.length,
			accepted,
		});
		if (!accepted) break;
	}
	return { published, joined };
}
// #endregion FUNC_publishRounds

// #region FUNC_prepareCompact
/**
 * @purpose Publish the copies and joins of one tree and give the merge inputs that remain.
 * @invariants A job holds at most fifty merge inputs. The job text strips the input block tags.
 * @param memory - The store and the profile of the session.
 * @param scope - The scope of the compaction.
 * @returns The merge inputs, the task text, and the publication counts.
 */
export function prepareCompact(
	memory: AgentMemory,
	scope: ScopeKey,
): {
	readonly inputs: readonly BuildInput[];
	readonly job: string;
	readonly copies: number;
	readonly joins: number;
} {
	const found = readyInputs(memory, scope).length;
	const { published, joined } = publishRounds(memory, scope);
	const inputs = readyInputs(memory, scope)
		.filter(({ read }) => !read.fits)
		.map(({ input }) => input)
		.slice(0, MAX_INPUTS);
	const job = inputs.length
		? batchTask(NODE_TARGET, inputs, visibleScopeList(memory)).replace(
				/<input id="(#[^"]+)">/g,
				"$1",
			)
		: "";
	debug("Compaction prepared", {
		event: "compact",
		scope,
		found,
		merges: inputs.length,
		published,
		joined,
	});
	return { inputs, job, copies: published - joined, joins: joined };
}
// #endregion FUNC_prepareCompact

// #region FUNC_parseAnswers
/**
 * @purpose Turn answer lines into aligned ranges.
 * @invariants Each line needs the form "#a-b: text", and the range must be aligned at its level.
 *   A duplicate address gives an error.
 * @param raw - The answer text of the request.
 */
export function parseAnswers(raw: string): readonly Answer[] {
	const answers: Answer[] = [];
	const seen = new Set<string>();
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const match = /^#(\d+)-(\d+): ?(.*)$/.exec(trimmed);
		if (!match?.[1] || !match[2] || match[3] === undefined)
			throw new MemlensError(
				"Data",
				`The answer line "${trimmed}" needs the form "#a-b: text".`,
			);
		const start = Number(match[1]);
		const end = Number(match[2]);
		const size = end - start + 1;
		const level = Math.log2(size);
		if (!Number.isInteger(level) || level < 1 || start % size !== 0)
			throw new MemlensError(
				"Data",
				`The answer address #${match[1]}-${match[2]} is not one aligned range.`,
			);
		const addr = `#${match[1]}-${match[2]}`;
		if (seen.has(addr))
			throw new MemlensError(
				"Data",
				`The input holds two answers for ${addr}.`,
			);
		seen.add(addr);
		answers.push({ addr, range: { start, level }, text: match[3] });
	}
	if (!answers.length)
		throw new MemlensError("Data", "The answer holds no line.");
	return answers;
}
// #endregion FUNC_parseAnswers

// #region FUNC_canonical
/**
 * @purpose Render one build input with sorted keys, so an input check ignores the field order.
 * @invariants Each nested object renders with its keys sorted. A list keeps its order.
 */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, item) =>
		item !== null && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort()
						.map((key) => [key, (item as Record<string, unknown>)[key]]),
				)
			: item,
	);
}
// #endregion FUNC_canonical

// #region FUNC_applyAnswers
/**
 * @purpose Write one answer for each range into the store as node rows.
 * @invariants An empty answer gives a Data error. A changed input counts as rejected with its
 *   address.
 * @param copied - The inputs of the job, or null when the request holds none.
 */
export function applyAnswers(
	memory: AgentMemory,
	scope: ScopeKey,
	answers: readonly Answer[],
	copied: readonly BuildInput[] | null,
): { readonly built: number; readonly rejected: readonly string[] } {
	let built = 0;
	const rejected: string[] = [];
	for (const answer of answers) {
		const current = buildInput(memory, scope, answer.range);
		if (
			current === null ||
			(copied !== null &&
				!copied.some((value) => canonical(value) === canonical(current.input)))
		) {
			rejected.push(answer.addr);
			continue;
		}
		const line = answerLine(current.input, answer.text);
		if (!line.ok)
			throw new MemlensError("Data", `The answer for ${answer.addr} is empty.`);
		const result = publishNode(
			memory.store,
			scope,
			current.input.range.level,
			current.input.range.start,
			line.summary,
			current.read,
		);
		if (result.ok) built += 1;
		else rejected.push(answer.addr);
	}
	debug("Answers applied", {
		event: "answer",
		built,
		rejected: rejected.length,
	});
	return { built, rejected };
}
// #endregion FUNC_applyAnswers

// #region FUNC_compactAction
/**
 * @purpose Give one job, or write one answer.
 * @invariants The answer applies only to a copy input of its job. A stale input counts as
 *   rejected.
 * @param request - The resolved console request with the action fields.
 */
export async function compactAction(request: ConsoleRequest): Promise<unknown> {
	const { memory, scope, fields } = request;
	if (fields.action === "compact") return prepareCompact(memory, scope);
	const answers = parseAnswers(text(fields, "answers"));
	const copied = Array.isArray(fields.inputs)
		? (fields.inputs as readonly BuildInput[])
		: null;
	if (!copied)
		throw new MemlensError("Usage", "The answer needs copied inputs.");
	const { built, rejected } = applyAnswers(memory, scope, answers, copied);
	return { built, rejected: rejected.length, rejectedRanges: rejected };
}
// #endregion FUNC_compactAction
