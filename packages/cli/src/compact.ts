import { readFileSync } from "node:fs";
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
	normalizeScopeKey,
	publishJoin,
	publishNode,
	readBuild,
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

/** Read the current build input for one candidate range. */
function buildInput(
	store: Runtime["store"],
	scope: ScopeKey,
	range: { level: number; start: number },
) {
	const read = readBuild(store, scope, range.level, range.start);
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
				kind: "record" as const,
				id: key ?? "",
				pos: start,
				body: text,
				preview:
					start === range.start ? (read.aPreview ?? "") : (read.bPreview ?? ""),
				ts: start === range.start ? read.tsFrom : read.tsTo,
			};
		return {
			kind: "node" as const,
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
			] as const,
		},
	};
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
	options: {
		readonly dryRun?: boolean;
		readonly max?: number;
		readonly scopeKeys?: readonly ScopeKey[];
	} = {},
): Promise<CompactJob> {
	const dryRun = options.dryRun === true;
	const max = options.max ?? 50;
	const ready = () =>
		candidates(runtime.store, scope).flatMap((range) => {
			const result = buildInput(runtime.store, scope, range);
			return result ? [{ range, result }] : [];
		});
	const first = ready();
	let published = 0;
	let joined = 0;
	if (!dryRun) {
		for (let round = 1; ; round += 1) {
			let accepted = 0;
			let roundJoins = 0;
			for (const {
				range,
				result: { input, read },
			} of ready()) {
				const [left, right] = input.children;
				const joinedLine = left && right ? joinBuild(input) : null;
				if (joinedLine) {
					const result = publishJoin(
						runtime.store,
						scope,
						range.level,
						range.start,
						read,
					);
					if (result.ok) {
						accepted += 1;
						roundJoins += 1;
					}
				} else if (!left || !right) {
					const line = copyBuild(input);
					const result = publishNode(
						runtime.store,
						scope,
						range.level,
						range.start,
						line.summary,
						read,
					);
					if (result.ok) accepted += 1;
				}
			}
			published += accepted;
			joined += roundJoins;
			debug("Mechanical round", {
				event: "round",
				round,
				found: ready().length,
				accepted,
			});
			if (!accepted) break;
		}
	}
	const inputs = ready()
		.filter(
			({ result: { input } }) => input.children.filter(Boolean).length === 2,
		)
		.map(({ result: { input } }) => input)
		.slice(0, max);
	return {
		inputs,
		job: inputs.length
			? batchTask(NODE_TARGET, inputs, options.scopeKeys).replace(
					/<input id="(#[^"]+)">/g,
					"$1",
				)
			: "",
		found: first.length,
		published,
		joined,
	};
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
		const job = await prepareCompact(runtime, scope, {
			dryRun,
			max: countFlag(args.flags, "max", 50),
		});
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
					job.job.replace(/<input id="(#[^"]+)">/g, "$1"),
				].join("\n")
			: "no merge inputs";
		debug("Job listed", { event: "job", merges: job.inputs.length });
		return [...head, body].join("\n");
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_compactJob

/** @purpose Render one build input with sorted keys, so an input check ignores the field order. */
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

// #region FUNC_applyAnswers

/**
 * Write one answer for each range into the store as node events.
 *
 * @purpose Turn the answers of a job into built nodes through one rule set for both hosts.
 * @invariants An empty answer gives a Data error. The store checks the exact input under the write
 * lock, and a changed input counts as rejected with its address. The shrink check applies to no answer.
 */
export async function applyAnswers(
	runtime: Runtime,
	scope: ScopeKey,
	_tree: unknown,
	answers: readonly Answer[],
	copied: readonly BuildInput[] | null = null,
): Promise<{ readonly built: number; readonly rejected: readonly string[] }> {
	let built = 0;
	const rejected: string[] = [];
	for (const answer of answers) {
		const current = buildInput(runtime.store, scope, answer.range);
		if (
			current === null ||
			(copied !== null &&
				!copied.some((value) => canonical(value) === canonical(current.input)))
		) {
			rejected.push(answer.addr);
			continue;
		}
		const { input, read } = current;
		const line = answerLine(input, answer.text);
		if (!line.ok)
			throw new MemlensError("Data", `The answer for ${answer.addr} is empty.`);
		const result = publishNode(
			runtime.store,
			scope,
			input.range.level,
			input.range.start,
			line.summary,
			read,
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
		const { built, rejected } = await applyAnswers(
			runtime,
			scope,
			null,
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
