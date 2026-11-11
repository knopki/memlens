/**
 * The compaction job of the CLI.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the dirty ranges of one scope to a human or an agent as one job, and write the
 * answers back as node events, so the tree builds in the terminal with no model.
 * @scope
 *  - The copy publication, the merge inputs of one job, the job text, and the answer application.
 *  - NOT: the background compaction, the model calls, and the store logic.
 * @invariants
 *  - The scope comes from --scope or from the active scope of the working directory, and the
 *    profile must list it.
 *  - A copy input or a fitting pair publishes with no model call and no answer. The publication
 *    repeats in rounds until one round publishes nothing, and the job lists the merge inputs
 *    from a fresh projection after the last round.
 *  - The job shows the merge task of each input. The flag --max limits the merge inputs of one job.
 *  - The answer file holds one "#a-b: text" line for each range. The flag --answer applies the
 *    answers through the input check of the store.
 *  - An empty answer gives an error. An answer above the node limit cuts with the truncated flag.
 *    The shrink check applies to no answer.
 *  - The flag --dry-run writes nothing and lists the job.
 *  - A rejected answer names a changed input. The next job lists its range again.
 *  - The console host calls prepareCompact and applyAnswers, so one job format serves both hosts.
 * @usecases
 *  - Job: user => runs compact => answers the job => runs compact --answer => gets built nodes
 * @dependencies
 *  USES API: @memlens/core, args.ts, commands.ts, runtime.ts
 *  WRITES: the store directory
 * @keywords compact, job, merge, answer, copy, node, tree
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { debuglog, isDeepStrictEqual } from "node:util";
import type {
	BuildInput,
	LineBuild,
	Projection,
	ScopeKey,
	Tree,
} from "@memlens/core";
import {
	answerLine,
	batchTask,
	buildInput,
	candidates,
	copyBuild,
	joinBuild,
	MemlensError,
	NODE_TARGET,
	nodeEvent,
	normalizeScopeKey,
	scopeTree,
} from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import { type CommandIo, countFlag, flagValue } from "./commands.js";
import {
	cliActiveScope,
	loadCliBaseConfig,
	openRuntime,
	type Runtime,
	runtimeVisibleScopes,
} from "./runtime.js";

const debug = debuglog("memlens:compact");

/** The result of one prepared compaction job. */
export interface CompactJob {
	/** The merge inputs of the job, in candidate order. */
	readonly inputs: readonly BuildInput[];
	/** The merge task text, with one block for each input. Empty when no input waits. */
	readonly job: string;
	/** The copy and join inputs that the projection held before the publication. */
	readonly found: number;
	/** The copies and joins that the store accepted. */
	readonly published: number;
	/** The joins that the store accepted. This count is part of the published count. */
	readonly joined: number;
}

/** The merge inputs with two live children, in candidate order. */
function mergeInputs(tree: Tree): readonly BuildInput[] {
	return readyInputs(tree).filter((input) => live(input) === 2);
}

/** Each ready build input of the dirty ranges of the tree, in candidate order. */
function readyInputs(tree: Tree): readonly BuildInput[] {
	return candidates(tree)
		.map((range) => buildInput(tree, range))
		.filter((input): input is BuildInput => input !== null);
}

/** The count of live children of one input. */
function live(input: BuildInput): number {
	return input.children.filter((child) => child !== null).length;
}

/** One input that publishes with no model call: a copy or the join of a fitting pair. */
interface MechanicalLine {
	readonly input: BuildInput;
	readonly line: Extract<LineBuild, { ok: true }>;
	readonly join: boolean;
}

/** Each ready input of the tree that publishes with no model call, in candidate order. */
function mechanicalInputs(tree: Tree): readonly MechanicalLine[] {
	const result: MechanicalLine[] = [];
	for (const input of readyInputs(tree)) {
		if (live(input) < 2) {
			result.push({ input, line: copyBuild(input), join: false });
			continue;
		}
		const line = joinBuild(input);
		if (line) result.push({ input, line, join: true });
	}
	return result;
}

/** The scope of the compaction: --scope, or the active scope of the working directory. */
function compactScope(args: ParsedArgs, io: CommandIo): ScopeKey {
	const base = loadCliBaseConfig(io.env);
	const raw = flagValue(args.flags, "scope") ?? cliActiveScope(base, io.cwd);
	return normalizeScopeKey(raw) as ScopeKey;
}

/** Open the runtime for the compaction of one scope, with the profile check. */
async function compactRuntime(
	args: ParsedArgs,
	io: CommandIo,
	scope: ScopeKey,
): Promise<Runtime> {
	const runtime = await openRuntime({
		storeFlag: flagValue(args.flags, "store"),
		profile: null,
		env: io.env,
	});
	if (!runtimeVisibleScopes(runtime).includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	return runtime;
}

// #region FUNC_compactCommand
/**
 * Give the next compaction job of one scope, or apply one answer file.
 *
 * @purpose Start the tree build from the terminal, so the memory compacts without the harness and
 * without a model call.
 * @invariants The flag --answer applies one answer file. With no --answer, the command publishes
 * each copy input and prints the job of the merge inputs. The flags --scope, --max, and --dry-run
 * apply to the job.
 */
export async function compactCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const scope = compactScope(args, io);
	const answer = flagValue(args.flags, "answer");
	debug("Compact start", { event: "start", scope, answer: answer !== null });
	const result =
		answer === null
			? await compactJob(args, io, scope)
			: await compactAnswer(args, io, scope, answer);
	debug("Compact done", { event: "end", scope });
	return result;
}
// #endregion FUNC_compactCommand

// #region FUNC_prepareCompact
/**
 * Publish the copies and joins of one tree and give the merge inputs that remain.
 *
 * @purpose Let a terminal user and a console user start one job with one rule set.
 * @invariants Publish each copy input and each fitting join with no model call. A dry run writes
 * nothing. The publication rounds repeat until one round publishes nothing, so one run completes
 * each chain of joins. The merge inputs come from the projection after the last round, and the
 * limit applies after that read.
 */
export async function prepareCompact(
	runtime: Runtime,
	scope: ScopeKey,
	treeOf: (projection: Projection) => Tree,
	options: {
		readonly dryRun?: boolean;
		readonly max?: number;
		readonly scopeKeys?: readonly ScopeKey[];
	} = {},
): Promise<CompactJob> {
	const dryRun = options.dryRun === true;
	const max = options.max ?? 50;
	const first = treeOf(runtime.projection);
	const found = mechanicalInputs(first).length;
	let published = 0;
	let joined = 0;
	if (!dryRun) {
		let current = first;
		for (let round = 1; ; round += 1) {
			const ready = mechanicalInputs(current);
			if (!ready.length) break;
			let accepted = 0;
			for (const item of ready) {
				const appended = await runtime.store.appendNode(
					item.input,
					nodeEvent(scope, current, item.input, item.line),
				);
				if (appended.ok) {
					accepted += 1;
					published += 1;
					if (item.join) joined += 1;
				}
			}
			debug("Mechanical round", {
				event: "round",
				round,
				found: ready.length,
				accepted,
			});
			if (!accepted) break;
			current = treeOf(await runtime.store.projection());
		}
	}
	const tree = dryRun ? first : treeOf(await runtime.store.projection());
	const inputs = mergeInputs(tree).slice(0, max);
	const job = inputs.length
		? batchTask(NODE_TARGET, inputs, options.scopeKeys)
		: "";
	debug("Job prepared", {
		event: "prepare",
		copies: found,
		published,
		joins: joined,
		merges: inputs.length,
	});
	return { inputs, job, found, published, joined };
}
// #endregion FUNC_prepareCompact

// #region FUNC_compactJob
/**
 * Print the job of the merge inputs.
 *
 * @purpose Give a human or an agent the exact merge tasks of the dirty ranges, so the answers
 * need no model.
 * @invariants The command publishes no copy with --dry-run. The job lists at most --max merge
 * inputs from the projection after the copy publication.
 */
async function compactJob(
	args: ParsedArgs,
	io: CommandIo,
	scope: ScopeKey,
): Promise<string> {
	const runtime = await compactRuntime(args, io, scope);
	try {
		const dryRun = args.flags["dry-run"] === true;
		const job = await prepareCompact(
			runtime,
			scope,
			(projection) => scopeTree(projection, scope),
			{ dryRun, max: countFlag(args.flags, "max", 50) },
		);
		const head = [
			`scope: ${scope}`,
			dryRun
				? `would publish ${job.found} copies and joins`
				: `published ${job.published - job.joined} copies, ${job.joined} joins`,
		];
		const body = job.job
			? [
					`Then run: memlens compact --answer <path> --scope ${scope}`,
					"",
					job.job,
				].join("\n")
			: "no merge inputs";
		debug("Job listed", { event: "job", merges: job.inputs.length });
		return [...head, body].join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_compactJob

// #region FUNC_applyAnswers
/**
 * Write one answer for each range into the store as node events.
 *
 * @purpose Turn the answers of a job into built nodes through one rule set for both hosts.
 * @invariants An empty answer gives a Data error. The store checks the exact input under the write
 * lock, and a changed input counts as rejected with its address. The shrink check applies to no answer.
 * A copied job rejects an answer whose current input differs from the copied input.
 */
export async function applyAnswers(
	runtime: Runtime,
	scope: ScopeKey,
	tree: Tree,
	answers: readonly Answer[],
	copied: readonly BuildInput[] | null = null,
): Promise<{ readonly built: number; readonly rejected: readonly string[] }> {
	let built = 0;
	const rejected: string[] = [];
	for (const answer of answers) {
		const input = buildInput(tree, answer.range);
		if (
			input === null ||
			(copied !== null &&
				!copied.some((value) => isDeepStrictEqual(value, input)))
		) {
			rejected.push(answer.addr);
			continue;
		}
		const line = answerLine(input, answer.text);
		if (!line.ok)
			throw new MemlensError("Data", `The answer for ${answer.addr} is empty.`);
		const appended = await runtime.store.appendNode(
			input,
			nodeEvent(scope, tree, input, line),
		);
		if (appended.ok) built += 1;
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

// #region FUNC_compactAnswer
/**
 * Apply one answer file as node events.
 *
 * @purpose Write the answers of a job into the store, so the tree holds the built nodes.
 * @invariants Each answer names one aligned range with "#a-b: text". A rejected answer counts and
 * stays for the next job.
 */
async function compactAnswer(
	args: ParsedArgs,
	io: CommandIo,
	scope: ScopeKey,
	answerPath: string,
): Promise<string> {
	const runtime = await compactRuntime(args, io, scope);
	try {
		const answers = parseAnswerFile(answerPath);
		const tree = scopeTree(await runtime.store.projection(), scope);
		const { built, rejected } = await applyAnswers(
			runtime,
			scope,
			tree,
			answers,
		);
		const hint =
			rejected.length > 0
				? `\nrun memlens compact again for the rejected ranges: ${rejected.join(", ")}`
				: "";
		return `built ${built} nodes, rejected ${rejected.length}${hint}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_compactAnswer

/** One parsed answer line: the range, its address, and the answer text. */
export interface Answer {
	readonly addr: string;
	readonly range: { readonly start: number; readonly level: number };
	readonly text: string;
}

// #region FUNC_parseAnswers
/**
 * @purpose Turn answer lines into aligned ranges for both hosts.
 * @invariants Each line needs the form "#a-b: text", and the range must be aligned at its level.
 * A duplicate address gives an error.
 */
export function parseAnswers(text: string): readonly Answer[] {
	const answers: Answer[] = [];
	const seen = new Set<string>();
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const match = /^#(\d+)-(\d+): ?(.*)$/.exec(line);
		if (!match?.[1] || !match[2] || match[3] === undefined)
			throw new MemlensError(
				"Data",
				`The answer line "${line}" needs the form "#a-b: text".`,
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

/** Read one answer file and check the form of each line. */
function parseAnswerFile(path: string): readonly Answer[] {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
	try {
		return parseAnswers(text);
	} catch (error) {
		throw error instanceof MemlensError
			? new MemlensError("Data", `The file ${path}: ${error.message}`)
			: error;
	}
}
