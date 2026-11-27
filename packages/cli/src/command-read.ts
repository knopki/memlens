/**
 * Read commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Show notes, scopes, and the memory slice from the terminal, so a user reads the memory
 *   without the harness.
 * @scope
 *  - The commands find, open, scopes, scope, and slice.
 *  - NOT: the store rules, the argument parse, and the exit code mapping.
 * @dependencies USES API: @memlens/core, commander; READS: the store directory
 * @keywords find, open, scopes, scope, slice, read, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type {
	IndexHit,
	Note,
	NoteKind,
	RuleTrace,
	RuleVerdict,
	ScopeContextResult,
	ScopeKey,
} from "@memlens/core";
import {
	dayOf,
	loadRangeView,
	MemlensError,
	normalizeScopeKey,
	nowIso,
	openNote,
	openRange,
	parseAddress,
	readConsole,
	resolveTarget,
	scopeLines,
	search,
} from "@memlens/core";
import type { Command } from "commander";
import {
	type CommandIo,
	command,
	JSON_FLAG,
	KINDS,
	limit,
	openCommandRuntime,
	print,
	type Run,
	reply,
	SCOPE,
	SCOPES,
	STORE,
	scopeList,
} from "./commands.js";
import {
	cliActiveScope,
	cliScopeResult,
	loadCliBaseConfig,
	type Runtime,
	resolveForProfile,
} from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_commands
/**
 * @purpose Declare the signature and the flags of each read command once, so the help comes from
 *   the same place as the parse.
 */
export function commands(run: Run): Command[] {
	const io = run.io;
	return [
		command("find [words]", "Search the notes by words.")
			.addOption(SCOPES)
			.addOption(KINDS)
			.addOption(limit(10))
			.option("--since <day>", "The first day of the period.")
			.option("--until <day>", "The last day of the period.")
			.option("--due", "Keep the records with a review date in the past.")
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((words: string | undefined, options) =>
				reply(run, findCommand({ ...options, words }, io)),
			),
		command("open <target>", "Read one note, or the two lines below a summary.")
			.addOption(SCOPE)
			.option("--no-longform", "Omit the document text.")
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((target: string, options) =>
				reply(run, openCommand({ ...options, target }, io)),
			),
		command("scopes", "List the visible scopes.")
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((options) => reply(run, scopesCommand(options, io))),
		command("scope", "Give the active scope of the directory.").action(() =>
			reply(run, scopeCommand(io)),
		),
		command("slice", "Print the map that the agent gets.")
			.option(
				"--profile <name>",
				"The profile of the slice. The default profile applies without the flag.",
			)
			.addOption(SCOPE)
			.addOption(JSON_FLAG)
			.addOption(STORE)
			.action((options) => reply(run, sliceCommand(options, io))),
	];
}
// #endregion FUNC_commands

// #region FUNC_findCommand
/**
 * Find the records with matching words, or the newest records.
 *
 * @purpose Answer a search from the terminal, so a user finds a note without the slice.
 * @invariants The filters --scope, --kind, --since, --until, --due, and --limit cut the rows before
 *   the limit.
 */
export async function findCommand(
	input: {
		words?: string;
		scope?: string[];
		kind?: NoteKind[];
		since?: string;
		until?: string;
		due?: boolean;
		limit: number;
		json?: boolean;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const scopes = scopeList(input.scope ?? []);
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const kinds = input.kind ?? [];
		const hits = search(
			runtime.store,
			{
				query: input.words ?? "",
				scopes: scopes.length === 0 ? null : scopes,
				kinds: kinds.length === 0 ? null : kinds,
				since: input.since ?? null,
				until: input.until ?? null,
				due: input.due ?? false,
				limit: input.limit,
			},
			nowIso(),
		);
		debug("Find answered", { event: "find", hits: hits.length });
		return input.json ? print(hits) : hits.map(renderHit).join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_findCommand

function renderHit(hit: IndexHit): string {
	return `${hit.addr}  ${dayOf(hit.ts)}  ${hit.kind}  ${hit.body}`;
}

function checkedScope(runtime: Runtime, raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw) as ScopeKey;
	if (!runtime.scopes.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	return scope;
}

// #region FUNC_openCommand
/**
 * Open one record or one range.
 *
 * @purpose Show one note with its document, or the children of one range, so a user reads the
 *   content behind one line.
 * @invariants The flag --no-longform omits the document text. The default mode gives the whole
 *   longform.
 */
export async function openCommand(
	input: {
		target: string;
		scope?: string;
		longform: boolean;
		json?: boolean;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const address = parseAddress(input.target);
		if (address === null)
			throw new MemlensError(
				"Usage",
				`The target ${input.target} is not an address.`,
			);
		const answer =
			address.kind === "range" || address.kind === "scoped-range"
				? openRangeAddress(
						runtime,
						address.scope ?? input.scope ?? null,
						address.start,
						address.end,
					)
				: openPos(
						resolveTarget(
							runtime.store,
							input.scope ?? null,
							input.target,
							(scope) => checkedScope(runtime, scope),
						),
						!input.longform,
					);
		debug("Open answered", { event: "open", scope: answer.scope });
		return input.json ? print(answer.value) : answer.text;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_openCommand

function openPos(
	record: Note,
	noLongform: boolean,
): {
	value: unknown;
	text: string;
	scope: ScopeKey;
} {
	const entry = openNote(record.scope, record, noLongform ? "none" : "all");
	const document =
		entry.longformChars === 0
			? ""
			: `\n--- longform ${entry.longformChars} chars ---\n${entry.longform ?? ""}`;
	const text = `${entry.addr}  ${dayOf(entry.ts)}  ${record.kind}  review ${entry.review_at ? dayOf(entry.review_at) : "never"}\n${entry.body}${document}`;
	return { value: entry, text, scope: record.scope };
}

function openRangeAddress(
	runtime: Runtime,
	scopeText: string | null,
	start: number,
	end: number,
): { value: unknown; text: string; scope: ScopeKey } {
	if (scopeText === null)
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	const scope = checkedScope(runtime, scopeText);
	const children = openRange(
		scope,
		loadRangeView(runtime.store, scope),
		start,
		end,
	);
	const text =
		children.children.length === 0
			? "The range holds no record."
			: children.children
					.map(
						(line) =>
							`${line.addr}  ${dayOf(line.ts_from)}..${dayOf(line.ts_to)}  ${line.text}`,
					)
					.join("\n");
	return { value: children, text, scope };
}

// #region FUNC_scopesCommand
/**
 * List the visible scopes.
 *
 * @purpose Show each visible scope with its live count and its last write, so a user sees the
 *   shape of the memory.
 */
export async function scopesCommand(
	input: { json?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const lines = scopeLines(runtime.store, runtime.scopes);
		debug("Scopes listed", { event: "scopes", count: lines.length });
		return input.json
			? print(lines)
			: lines
					.map((line) => `${line.key}  ${line.notes}  ${line.lastSeen}`)
					.join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_scopesCommand

// #region FUNC_scopeCommand
/**
 * Give the active scope of the directory.
 *
 * @purpose Show the inputs, the verdict of each rule, and the key, so a user sees why a session
 *   writes where it writes.
 * @invariants The answer holds the inputs of the subject, one line for each rule, then the key and
 *   its source. The command opens no store.
 */
export function scopeCommand(io: CommandIo): string {
	const base = loadCliBaseConfig(io.env);
	const result = cliScopeResult(base, io.cwd);
	debug("Scope resolved", {
		event: "scope",
		key: result.key,
		rule: result.rule,
		source: result.source,
	});
	return renderScope(result);
}
// #endregion FUNC_scopeCommand

const VERDICT_WORDS: Record<RuleVerdict, string> = {
	matched: "matched",
	"no-input": "no input",
	"no-match": "no match",
	"invalid-key": "invalid key",
};

function renderScope(result: ScopeContextResult): string {
	const lines = [
		...inputLines(result),
		"",
		"rules",
		...(result.trace.length === 0 ? ["  (none)"] : result.trace.map(ruleLine)),
		"",
		`scope  ${result.key}`,
		`from   ${result.rule === null ? `automatic ${result.source}` : `rule ${result.rule}`}`,
	];
	return lines.join("\n");
}

function inputLines(result: ScopeContextResult): string[] {
	const labels = ["remote", "canonical", "dir", "repo"];
	const values = [
		result.remote ?? "-",
		result.canonical ?? "-",
		result.dir,
		result.repo ?? "-",
	];
	const width = Math.max(...labels.map((label) => label.length));
	return labels.map(
		(label, index) => `${label.padEnd(width)}  ${values[index] ?? ""}`,
	);
}

function ruleLine(entry: RuleTrace, index: number): string {
	const verdict = VERDICT_WORDS[entry.verdict];
	const result = entry.key === null ? verdict : `${verdict} ${entry.key}`;
	return `  [${index}] ${describeRule(entry.rule)} -> ${result}`;
}

function describeRule(rule: unknown): string {
	if (typeof rule !== "object" || rule === null) return "unknown";
	const record = rule as Record<string, unknown>;
	if (record.match === "workspace") return `workspace ${String(record.id)}`;
	return `${String(record.match)} ${String(record.glob)}`;
}

// #region FUNC_sliceCommand
/**
 * Render the memory slice.
 *
 * @purpose Give the context text of one profile and one active scope, so a user sees what a
 *   session reads.
 * @invariants The profile comes from --profile or defaultProfile. A profile that the base file
 *   does not name uses the default profile values. The render calls no model and waits for no
 *   compaction.
 */
export async function sliceCommand(
	input: { profile?: string; scope?: string; json?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const base = loadCliBaseConfig(io.env);
	const profile = input.profile ?? base.defaultProfile;
	const config = resolveForProfile(base, profile);
	const active = normalizeScopeKey(
		input.scope ?? cliActiveScope(base, io.cwd),
	) as ScopeKey;
	const runtime = await openCommandRuntime(io, input.store, profile);
	try {
		const view = await readConsole(
			runtime.store,
			config,
			active,
			undefined,
			null,
			"session",
		);
		const text = view.text ?? "";
		debug("Slice rendered", {
			event: "slice",
			profile,
			scope: active,
			chars: text.length,
		});
		return input.json
			? print({ profile, scope: active, chars: text.length, text })
			: text;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_sliceCommand
