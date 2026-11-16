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
 * @dependencies USES API: @memlens/core, commands.ts, runtime.ts; READS: the store directory
 * @keywords find, open, scopes, scope, slice, read, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { IndexHit, ScopeKey } from "@memlens/core";
import {
	byAddress,
	filterHits,
	loadRangeView,
	MemlensError,
	normalizeScopeKey,
	nowIso,
	openNote,
	openRange,
	parseAddress,
	readConsole,
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
	return `${hit.addr}  ${hit.ts.slice(0, 10)}  ${hit.kind}  ${hit.body}`;
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
		const address = parseAddress(raw);
		if (address === null)
			throw new MemlensError("Usage", `The target ${raw} is not an address.`);
		const scopeRaw = address.scope ?? flagValue(args.flags, "scope");
		if (scopeRaw === null)
			throw new MemlensError(
				"Usage",
				"The target needs a scope in the address or in --scope.",
			);
		const scope = normalizeScopeKey(scopeRaw) as ScopeKey;
		if (!runtime.scopes.includes(scope))
			throw new MemlensError(
				"NotAllowed",
				`The scope ${scope} is not visible.`,
			);
		const answer =
			address.kind === "pos" || address.kind === "scoped-pos"
				? openPos(runtime, scope, address.pos, args)
				: openRangeAddress(runtime, scope, address.start, address.end);
		debug("Open answered", { event: "open", scope });
		return isJson(args.flags) ? print(answer.value) : answer.text;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_openCommand

/** One note answer: the entry object and its text form. */
function openPos(
	runtime: Runtime,
	scope: ScopeKey,
	pos: number,
	args: ParsedArgs,
): { value: unknown; text: string } {
	const record = byAddress(runtime.store, scope, pos);
	if (record === null)
		throw new MemlensError("Data", `No record of ${scope} is at ${pos}.`);
	const mode = args.flags["no-longform"] === true ? "none" : "head";
	const entry = openNote(
		scope,
		record,
		mode,
		countFlag(args.flags, "offset", 0),
	);
	const text = `${entry.addr}  ${entry.ts.slice(0, 10)}  ${entry.kind}  review ${entry.review_at ?? "never"}\n${entry.body}${
		entry.longform === undefined
			? ""
			: `\n--- longform ${entry.longformChars} chars, next offset ${entry.longformOffset} ---\n${entry.longform}`
	}`;
	return { value: entry, text };
}

/** One range answer: the children object and its text form. */
function openRangeAddress(
	runtime: Runtime,
	scope: ScopeKey,
	start: number,
	end: number,
): { value: unknown; text: string } {
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
	return { value: children, text };
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
 * @purpose Apply the rules of scope_default to the working directory, so a user sees where a
 *   session writes.
 * @invariants The answer holds the key and the rule that gave it, or the source of the key. The
 * command opens no store.
 */
export function scopeCommand(io: CommandIo): string {
	const base = loadCliBaseConfig(io.env);
	const result = cliScopeResult(base, io.cwd);
	const rule =
		result.rule === null
			? result.source
			: describeRule(base.scope_default.rules[result.rule] ?? null);
	debug("Scope resolved", {
		event: "scope",
		key: result.key,
		rule: result.rule,
	});
	return `${result.key}\nrule: ${rule}`;
}
// #endregion FUNC_scopeCommand

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
		const view = await readConsole(runtime.store, config, active);
		const text = view.text;
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
