/**
 * The compaction job of the CLI.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the dirty ranges of one scope to a human or an agent as one job, and write the
 * answers back as node events, so the tree builds in the terminal with no model.
 * @scope
 *  - The copy publication, the merge inputs of one job, the job text, and the answer application.
 *  - NOT: the background writer, the model calls, and the store logic.
 * @invariants
 *  - The scope comes from --scope or from the active scope of the working directory, and the
 *    profile must list it.
 *  - A copy input publishes its copy line with no model call and no answer, before the job lists
 *    the merge inputs from a fresh projection.
 *  - The job shows the merge task of each input. The flag --max limits the merge inputs of one job.
 *  - The answer file holds one "#a-b: text" line for each range. The flag --answer applies the
 *    answers through the input check of the store.
 *  - An empty answer gives an error. An answer above the node limit cuts with the truncated flag.
 *    The shrink check applies to no answer.
 *  - The flag --dry-run writes nothing and lists the job.
 *  - A rejected answer names a changed input. The next job lists its range again.
 * @usecases
 *  - Job: user => runs compact => answers the job => runs compact --answer => gets built nodes
 * @dependencies
 *  USES API: @memlens/core, args.ts, commands.ts, runtime.ts
 *  WRITES: the store directory
 * @keywords compact, job, merge, answer, copy, node, tree
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { debuglog } from "node:util";
import type { BuildChild, BuildInput, ScopeKey, Tree } from "@memlens/core";
import {
	answerLine,
	buildInput,
	candidates,
	copyBuild,
	MemlensError,
	mergeTask,
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

/** The merge inputs with two live children, in candidate order. */
function mergeInputs(tree: Tree): readonly BuildInput[] {
	return readyInputs(tree).filter((input) => live(input) === 2);
}

/** The copy inputs with one live child, in candidate order. */
function copyInputs(tree: Tree): readonly BuildInput[] {
	return readyInputs(tree).filter((input) => live(input) === 1);
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

/** The address text of the range of one input. */
function addressOf(input: BuildInput): string {
	return `#${input.range.start}-${input.range.start + 2 ** input.range.level - 1}`;
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

// #region FUNC_compactJob
/**
 * Publish the copy inputs and print the job of the merge inputs.
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
		let tree = scopeTree(runtime.projection, scope);
		const copies = copyInputs(tree);
		let published = 0;
		if (!dryRun)
			for (const input of copies) {
				const appended = await runtime.store.appendNode(
					input,
					nodeEvent(scope, tree, input, copyBuild(input)),
				);
				if (appended.ok) published += 1;
			}
		debug("Copies published", {
			event: "copies",
			published,
			of: copies.length,
		});
		const projection = await runtime.store.projection();
		tree = scopeTree(projection, scope);
		const max = countFlag(args.flags, "max", 50);
		const merges = mergeInputs(tree).slice(0, max);
		const head = [
			`scope: ${scope}`,
			dryRun
				? `would publish ${copies.length} copies`
				: `published ${published} copies`,
		];
		const body = merges.length
			? [
					'Answer one line for each range below, in the form "#a-b: line".',
					`Then run: memlens compact --answer <path> --scope ${scope}`,
					"",
					...merges.map((input) => {
						const children = input.children as readonly [
							BuildChild,
							BuildChild,
						];
						return `${addressOf(input)}\n${mergeTask(NODE_TARGET, children[0], children[1])}`;
					}),
				].join("\n")
			: "no merge inputs";
		debug("Job listed", { event: "job", merges: merges.length, max });
		return [...head, body].join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_compactJob

// #region FUNC_compactAnswer
/**
 * Apply one answer file as node events.
 *
 * @purpose Write the answers of a job into the store, so the tree holds the built nodes.
 * @invariants Each answer names one aligned range with "#a-b: text". The store rechecks the exact
 * input of each range under the write lock. A rejected answer counts and stays for the next job.
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
		let built = 0;
		let rejected = 0;
		for (const answer of answers) {
			const input = buildInput(tree, answer.range);
			if (input === null) {
				rejected += 1;
				continue;
			}
			const line = answerLine(input, answer.text);
			if (!line.ok)
				throw new MemlensError(
					"Data",
					`The answer for ${answer.addr} is empty.`,
				);
			const appended = await runtime.store.appendNode(
				input,
				nodeEvent(scope, tree, input, line),
			);
			if (appended.ok) built += 1;
			else rejected += 1;
		}
		debug("Answers applied", { event: "answer", built, rejected });
		const hint =
			rejected > 0 ? "\nrun memlens compact again for the rejected ranges" : "";
		return `built ${built} nodes, rejected ${rejected}${hint}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_compactAnswer

/** One parsed answer line: the range, its address, and the answer text. */
interface Answer {
	readonly addr: string;
	readonly range: { start: number; level: number };
	readonly text: string;
}

/** Read one answer file and check the form of each line. A duplicate address gives an error. */
function parseAnswerFile(path: string): readonly Answer[] {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
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
			throw new MemlensError("Data", `The file holds two answers for ${addr}.`);
		seen.add(addr);
		answers.push({ addr, range: { start, level }, text: match[3] });
	}
	if (!answers.length)
		throw new MemlensError("Data", `The file ${path} holds no answer.`);
	return answers;
}
