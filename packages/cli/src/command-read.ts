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
 * @dependencies USES API: @memlens/core; READS: the store directory
 * @keywords find, open, scopes, scope, slice, read, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type {
	IndexHit,
	Note,
	RuleTrace,
	RuleVerdict,
	ScopeKey,
} from "@memlens/core";
import {
	dayOf,
	filterHits,
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
import type { ParsedArgs } from "./args.js";
import {
	type CommandIo,
	countFlag,
	flagValue,
	isJson,
	openCommandRuntime,
	print,
	scopeList,
} from "./commands.js";
import {
	type CliScopeResult,
	cliActiveScope,
	cliScopeResult,
	loadCliBaseConfig,
	type Runtime,
	resolveForProfile,
} from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_findCommand
/**
 * Find the records with matching words.
 *
 * @purpose Answer a search from the terminal, so a user finds a note without the slice.
 * @invariants The filters --scope, --since, --until, --due, and --limit apply after the search.
 */
export async function findCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const scopes = scopeList(args.flags);
	const limit = countFlag(args.flags, "limit", 10);
	const runtime = await openCommandRuntime(args, io);
	try {
		const hits = scopes.length
			? (
					await Promise.all(
						scopes.map((scope) =>
							search(runtime.store, args.positional[0] ?? "", scope, 50),
						),
					)
				).flat()
			: await search(runtime.store, args.positional[0] ?? "", null, 50);
		const kept = filterHits(
			hits,
			{
				scopes: scopes.length === 0 ? null : scopes,
				since: flagValue(args.flags, "since"),
				until: flagValue(args.flags, "until"),
				due: args.flags.due === true,
				limit,
			},
			nowIso(),
		);
		debug("Find answered", { event: "find", hits: kept.length });
		return isJson(args.flags) ? print(kept) : kept.map(renderHit).join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_findCommand

function renderHit(hit: IndexHit): string {
	return `${hit.addr}  ${dayOf(hit.ts)}  ${hit.kind}  ${hit.body}`;
}

// #region FUNC_openCommand
/**
 * Open one record or one range.
 *
 * @purpose Show one note with its document, or the children of one range, so a user reads the
 *   content behind one line.
 * @invariants The flag --no-longform omits the document text. The default mode gives the first 8192
 *   characters of the longform, and --offset continues it.
 */
export async function openCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const raw = args.positional[0] ?? "";
		const fallback = flagValue(args.flags, "scope");
		const address = parseAddress(raw);
		if (address === null)
			throw new MemlensError("Usage", `The target ${raw} is not an address.`);
		const answer =
			address.kind === "range" || address.kind === "scoped-range"
				? openRangeAddress(
						runtime,
						address.scope ?? fallback,
						address.start,
						address.end,
					)
				: openPos(
						resolveTarget(runtime.store, fallback, raw, (scope) =>
							checkedScope(runtime, scope),
						),
						args,
					);
		debug("Open answered", { event: "open", scope: answer.scope });
		return isJson(args.flags) ? print(answer.value) : answer.text;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_openCommand

function checkedScope(runtime: Runtime, raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw) as ScopeKey;
	if (!runtime.scopes.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	return scope;
}

function openPos(
	record: Note,
	args: ParsedArgs,
): { value: unknown; text: string; scope: ScopeKey } {
	const mode = args.flags["no-longform"] === true ? "none" : "head";
	const entry = openNote(
		record.scope,
		record,
		mode,
		countFlag(args.flags, "offset", 0),
	);
	const text = `${entry.addr}  ${dayOf(entry.ts)}  ${entry.kind}  review ${entry.review_at ? dayOf(entry.review_at) : "never"}\n${entry.body}${
		entry.longform === undefined
			? ""
			: `\n--- longform ${entry.longformChars} chars, next offset ${entry.longformOffset} ---\n${entry.longform}`
	}`;
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
	const text = children.children
		.map(
			(line) =>
				`${line.addr}  ${line.ts_from}..${line.ts_to}  ${line.built ? line.text : "(no summary yet)"}`,
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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const lines = scopeLines(runtime.store, runtime.scopes);
		debug("Scopes listed", { event: "scopes", count: lines.length });
		return isJson(args.flags)
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

function renderScope(result: CliScopeResult): string {
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

function inputLines(result: CliScopeResult): string[] {
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
 *   does not name uses the default profile values. The render calls no model and
 *   waits for no compaction.
 */
export async function sliceCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const base = loadCliBaseConfig(io.env);
	const profile = flagValue(args.flags, "profile") ?? base.defaultProfile;
	const config = resolveForProfile(base, profile);
	const active = normalizeScopeKey(
		flagValue(args.flags, "scope") ?? cliActiveScope(base, io.cwd),
	) as ScopeKey;
	const runtime = await openCommandRuntime(args, io, profile);
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
		return isJson(args.flags)
			? print({ profile, scope: active, chars: text.length, text })
			: text;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_sliceCommand
