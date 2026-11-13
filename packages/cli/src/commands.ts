/**
 * CLI command implementations.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Turn one parsed command into one answer, so a user works with the memory without the
 * harness.
 * @scope
 *  - The commands note, find, open, forget, review, redact, amend, scopes, scope, slice, status,
 *    check, repair, export, import, and config.
 *  - NOT: argument parsing, the exit code mapping, the store logic, and the compaction job.
 * @invariants
 *  - The CLI has no active scope. The command note takes its scope in --scope. A command with a
 *    target takes the scope in the address or in --scope.
 *  - Each target scope must be visible in the profile, or the command gives NotAllowed and
 *    changes no record.
 *  - The commands find and review with no --scope use each visible scope of the profile.
 *  - A write without --review takes the review period of its kind from the configuration.
 *  - The supersedes targets resolve from addresses to ids before the write.
 *  - A redact asks for a confirmation, and --yes skips it.
 *  - An export takes --scope. With no flag, an md export writes one file for each scope and a
 *    jsonl export copies the whole store. With the flag, both write one scope, and a per-scope
 *    jsonl export also holds the top node of that scope.
 *  - An import with --as rewrites the scope of each imported non-catalog event to the given key.
 *    A catalog event keeps its scope.
 *  - The command check tests the store against its log: each exported event passes validation,
 *    the stored projection equals one fresh replay, and the jsonl source ends at the replay
 *    cursor. A finding answers with the exit code 1.
 *  - The command repair rebuilds the derived state from the log and lists the changes. The flag
 *    --dry-run lists the changes and writes nothing.
 *  - Each command closes its store before it returns.
 *  - NOT: the command ui and the import from harness sessions. The specification holds them as
 *    pending work.
 * @usecases
 *  - Note: user => gives body and --scope => gets the address of the saved record
 *  - Read: user => gives words or a target => gets the matching records
 * @dependencies
 *  USES API: @memlens/core, runtime.ts, export-md.ts, smol-toml
 *  WRITES: the store directory, the export directory, config.toml
 * @keywords command, note, find, open, forget, review, redact, amend, scopes, check, repair, export, import
 * #endregion moduleContract
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { debuglog } from "node:util";
import type {
	DueRecord,
	IndexHit,
	Note,
	NoteKind,
	ScopeKey,
} from "@memlens/core";
import {
	activeScope,
	addDaysAtTime,
	amend,
	byAddress,
	byId,
	check,
	dueRecords,
	exportLines,
	filterHits,
	hide,
	importLines,
	isCatalogKey,
	liveCounts,
	loadBaseConfig,
	loadRangeView,
	MemlensError,
	normalizeScopeKey,
	note,
	nowIso,
	openNote,
	openRange,
	parseAddress,
	readConsole,
	redact,
	review,
	scopeLines,
	scopeNotes,
	search,
	xdgDirs,
} from "@memlens/core";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { ParsedArgs } from "./args.js";
import { encodeScopeFilename, renderScopeMarkdown } from "./export-md.js";
import type { Runtime } from "./runtime.js";
import {
	cliActiveScope,
	DEFAULT_CONFIG_TOML,
	loadCliBaseConfig,
	openRuntime,
	profileLists,
	resolveForProfile,
	runtimeVisibleScopes,
} from "./runtime.js";

const debug = debuglog("memlens:commands");

/** The input and output surface of one command run. */
export interface CommandIo {
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;
	/** Ask one question and return the answer of the user. False stops the command. */
	confirm(question: string): Promise<boolean>;
}

const KINDS = ["decision", "preference", "fact", "task", "note"] as const;

/** The value of one flag, or null when the command did not give it. */
export function flagValue(
	flags: ParsedArgs["flags"],
	name: string,
): string | null {
	const value = flags[name];
	return typeof value === "string" ? value : null;
}

function flagList(flags: ParsedArgs["flags"], name: string): string[] {
	const value = flags[name];
	if (Array.isArray(value)) return [...value];
	if (typeof value === "string") return [value];
	return [];
}

/** The numeric value of one flag, or the fallback. */
export function countFlag(
	flags: ParsedArgs["flags"],
	name: string,
	fallback: number,
): number {
	const raw = flagValue(flags, name);
	if (raw === null) return fallback;
	if (!/^\d+$/.test(raw))
		throw new MemlensError("Usage", `The flag --${name} needs a whole number.`);
	return Number(raw);
}

/** Parse --review or --for: <number>d or never. The fallback gives the days of a kind. */
function reviewFlag(
	flags: ParsedArgs["flags"],
	name: string,
	fallbackDays: number,
): string | null {
	const raw = flagValue(flags, name);
	if (raw === null) return addDaysAtTime(Date.now(), fallbackDays);
	if (raw === "never") return null;
	if (!/^\d+d$/.test(raw))
		throw new MemlensError(
			"Usage",
			`The flag --${name} needs <number>d or never.`,
		);
	return addDaysAtTime(Date.now(), Number(raw.slice(0, -1)));
}

function isJson(flags: ParsedArgs["flags"]): boolean {
	return flags.json === true;
}

function print(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

async function openCommandRuntime(
	args: ParsedArgs,
	io: CommandIo,
	profile?: string,
): Promise<Runtime> {
	return openRuntime({
		storeFlag: flagValue(args.flags, "store"),
		profile: profile ?? null,
		env: io.env,
	});
}

// #region FUNC_noteCommand

/**
 * Write one note.
 *
 * @purpose Save one curated note from the terminal, so a user records a fact without a session.
 * @invariants The body and the longform file content go to the store as given, and the store
 * normalizes and splits them. Each supersedes target resolves to its id before the write.
 */
export async function noteCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const scope = requiredScope(args.flags);
	const kindRaw = flagValue(args.flags, "kind") ?? "note";
	if (!(KINDS as readonly string[]).includes(kindRaw))
		throw new MemlensError("Usage", `The kind ${kindRaw} is unknown.`);
	const kind = kindRaw as (typeof KINDS)[number];
	const runtime = await openCommandRuntime(args, io);
	try {
		const visible = runtimeVisibleScopes(runtime);
		const supersedes = flagList(args.flags, "supersedes")
			.flatMap((raw) => raw.split(","))
			.filter((raw) => raw !== "")
			.map((raw) => resolveRowTarget(runtime, visible, raw, scope).record.id);
		const longformFile = flagValue(args.flags, "longform");
		const longform = longformFile === null ? null : readBodyFile(longformFile);
		const reviewAt = reviewFlag(
			args.flags,
			"review",
			runtime.config.review[kind],
		);
		const proposed = !profileLists(runtime, scope);
		if (proposed)
			throw new MemlensError("NotAllowed", "The scope is not listed.");
		const saved = note(runtime.store, {
			scope,
			body: args.positional[0] ?? "",
			kind,
			ts: nowIso(),
			review_at: reviewAt,
			session: "cli",
			turn: "cli",
			preset: "cli",
			...(longform === null ? {} : { longform }),
			...(supersedes.length === 0 ? {} : { supersedes }),
		});
		if (!saved.ok) throw new MemlensError("Data", "The note is a duplicate.");
		const pos = saved.value.pos;
		debug("Note saved", { event: "note", scope, pos, proposed });
		return `saved ${scope}#${pos} (${kind}) review ${reviewAt ?? "never"}`;
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_noteCommand

/** One scope from --scope, or the Usage error. */
function requiredScope(flags: ParsedArgs["flags"]): ScopeKey {
	const raw = flagValue(flags, "scope");
	if (raw === null)
		throw new MemlensError("Usage", "The command needs --scope.");
	return normalizeScopeKey(raw) as ScopeKey;
}

/** Resolve an address to a visible note row. */
function resolveRowTarget(
	runtime: Runtime,
	visible: readonly ScopeKey[],
	raw: string,
	fallback: string | null,
): { scope: ScopeKey; record: Note } {
	const address = parseAddress(raw);
	if (!address || address.kind === "range" || address.kind === "scoped-range") {
		throw new MemlensError("Usage", `The target ${raw} is not a note address.`);
	}
	const scopeRaw = address.scope ?? fallback;
	if (scopeRaw === null) {
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	}
	const scope = normalizeScopeKey(scopeRaw) as ScopeKey;
	if (!visible.includes(scope)) {
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	}
	const record = byAddress(runtime.store, scope, address.pos);
	if (record === null) {
		throw new MemlensError("Data", `No note of ${scope} is at ${address.pos}.`);
	}
	return { scope, record };
}

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
	const scopes = flagList(args.flags, "scope").map(
		(raw) => normalizeScopeKey(raw) as ScopeKey,
	);
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
 * content behind one line.
 * @invariants The mode head gives the first 8192 characters of the longform, --offset continues
 * the document, and --no-longform omits the document text.
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
		const visible = runtimeVisibleScopes(runtime);
		if (!visible.includes(scope))
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

// #region FUNC_forgetCommand

/**
 * Hide one record.
 *
 * @purpose Remove one note from the view and keep it in the log, so a user curates without loss.
 */
export async function forgetCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			runtimeVisibleScopes(runtime),
			args.positional[0] ?? "",
			flagValue(args.flags, "scope"),
		);
		hide(
			runtime.store,
			record.id,
			flagValue(args.flags, "reason") ?? "cli forget",
		);
		debug("Record hidden", { event: "forget", scope, pos: record.pos });
		return `hidden ${scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_forgetCommand

// #region FUNC_reviewCommand

/**
 * List the due records, or mark records as reviewed.
 *
 * @purpose Give the review list or set the next review date, so a user keeps the memory current.
 * @invariants The list uses each visible scope with no --scope. The mark sets the date --for days
 * from today, or the period of the kind of the record.
 */
export async function reviewCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const mark = flagValue(args.flags, "mark");
		if (mark !== null) return reviewMark(runtime, args, mark);
		const scopes = flagList(args.flags, "scope").map(
			(raw) => normalizeScopeKey(raw) as ScopeKey,
		);
		const due = dueRecords(
			runtime.store,
			scopes.length === 0 ? runtimeVisibleScopes(runtime) : scopes,
			nowIso(),
		).slice(0, countFlag(args.flags, "limit", 50));
		debug("Review listed", { event: "review", due: due.length });
		return isJson(args.flags) ? print(due) : due.map(renderDue).join("\n");
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_reviewCommand

function renderDue(record: DueRecord): string {
	return `${record.addr}  ${record.review_at?.slice(0, 10)}  ${record.kind}  ${record.body}`;
}

async function reviewMark(
	runtime: Runtime,
	args: ParsedArgs,
	mark: string,
): Promise<string> {
	const answers: string[] = [];
	for (const raw of mark.split(",").filter((value) => value !== "")) {
		const { scope, record } = resolveRowTarget(
			runtime,
			runtimeVisibleScopes(runtime),
			raw,
			flagValue(args.flags, "scope"),
		);
		const reviewAt = reviewFlag(
			args.flags,
			"for",
			runtime.config.review[record.kind],
		);
		review(runtime.store, record.id, reviewAt);
		answers.push(`reviewed ${scope}#${record.pos} -> ${reviewAt}`);
	}
	return answers.join("\n");
}

// #region FUNC_redactCommand

/**
 * Erase the content of one record.
 *
 * @purpose Remove the content of one note from the store for good, so a user answers a request
 * to be forgotten.
 * @invariants The command asks for a confirmation. The flag --yes skips the question. The store
 * publishes the sanitized state atomically.
 */
export async function redactCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			runtimeVisibleScopes(runtime),
			args.positional[0] ?? "",
			flagValue(args.flags, "scope"),
		);
		const proceed =
			args.flags.yes === true ||
			(await io.confirm(
				`Redact ${scope}#${record.pos}? This erases the content for good.`,
			));
		if (!proceed) {
			debug("Redact cancelled", { event: "redact", scope, pos: record.pos });
			return "cancelled";
		}
		redact(
			runtime.store,
			record.id,
			flagValue(args.flags, "reason") ?? "cli redact",
		);
		debug("Record redacted", { event: "redact", scope, pos: record.pos });
		return `redacted ${scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_redactCommand

// #region FUNC_amendCommand

/**
 * Change the content or the scope of one record.
 *
 * @purpose Apply one correction to a record, so a user fixes a note without a new note.
 * @invariants The address scope gives the current scope of the record. The flag --scope gives the
 * destination scope, and it also names the current scope when the address holds none. The store
 * refuses an amendment that changes no content, scope, kind, or supersedes.
 * @invariants Supersede targets take the address form, and they resolve in the destination scope.
 */
export async function amendCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const destination = flagValue(args.flags, "scope");
	const runtime = await openCommandRuntime(args, io);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			runtimeVisibleScopes(runtime),
			args.positional[0] ?? "",
			destination,
		);
		const body = flagValue(args.flags, "body");
		const longformFile = flagValue(args.flags, "longform");
		const kindRaw = flagValue(args.flags, "kind");
		if (kindRaw !== null && !(KINDS as readonly string[]).includes(kindRaw))
			throw new MemlensError("Usage", `The kind ${kindRaw} is unknown.`);
		const target =
			destination === null
				? scope
				: (normalizeScopeKey(destination) as ScopeKey);
		const supersedes = flagList(args.flags, "supersedes")
			.flatMap((raw) => raw.split(","))
			.filter((raw) => raw !== "")
			.map(
				(raw) =>
					resolveRowTarget(runtime, runtimeVisibleScopes(runtime), raw, target)
						.record.id,
			);
		amend(runtime.store, {
			id: record.id,
			scope: target,
			...(body === null ? {} : { body }),
			...(longformFile === null
				? {}
				: { longform: readBodyFile(longformFile) }),
			...(kindRaw === null ? {} : { kind: kindRaw as NoteKind }),
		});
		for (const id of supersedes)
			hide(runtime.store, id, `superseded by ${record.id}`);
		debug("Record amended", {
			event: "amend",
			scope,
			pos: record.pos,
			kind: kindRaw,
			supersedes: supersedes.length,
		});
		return `amended ${scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_amendCommand

// #region FUNC_scopesCommand

/**
 * List the visible scopes.
 *
 * @purpose Show each visible scope with its live count and its last write, so a user sees the
 * shape of the memory.
 */
export async function scopesCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const lines = scopeLines(runtime.store, runtimeVisibleScopes(runtime));
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
 * session writes.
 * @invariants The command opens no store. The answer holds the key and the rule that gave it.
 */
export function scopeCommand(io: CommandIo): string {
	const base = loadCliBaseConfig(io.env);
	const result = activeScope(base.scope_default, { path: io.cwd });
	const rule =
		result.rule === null
			? "default"
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
 * session reads.
 * @invariants The profile comes from --profile or defaultProfile. The active scope comes from
 * the rules of scope_default for the working directory, and --scope replaces it. The render calls
 * no model and waits for no compaction.
 */
export async function sliceCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const base = loadCliBaseConfig(io.env);
	const profile = flagValue(args.flags, "profile") ?? base.defaultProfile;
	if (base.profile[profile] === undefined)
		throw new MemlensError(
			"Data",
			`config.profile holds no profile ${profile}`,
		);
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

// #region FUNC_statusCommand

/**
 * Summarize the store.
 *
 * @purpose Give the backend, the path, the revision, and the record counts, so a user checks one
 * store at a glance.
 */
export async function statusCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const rev = runtime.store.rev();
		const counts = liveCounts(runtime.store);
		const status = {
			path: runtime.path,
			rev,
			scopes: counts.size,
			live: [...counts.values()].reduce((sum, count) => sum + count, 0),
			due: dueRecords(runtime.store, runtimeVisibleScopes(runtime), nowIso())
				.length,
		};
		debug("Status answered", { event: "status", rev });
		return isJson(args.flags)
			? print(status)
			: Object.entries(status)
					.map(([key, value]) => `${key}: ${value}`)
					.join("\n");
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_statusCommand

// #region FUNC_checkCommand

/**
 * Test the store against its log.
 *
 * @purpose Report each mismatch between the derived state and the log, so a user trusts the
 * store or runs repair.
 * @invariants The command validates each exported event, compares the stored projection with one
 * fresh replay, and checks the end of the jsonl source against the replay cursor. A store with
 * a finding answers with the exit code 1.
 */
export async function checkCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<CommandAnswer> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const findings = check(runtime.store);
		const counts = liveCounts(runtime.store);
		const report = {
			path: runtime.path,
			records: [...counts.values()].reduce((sum, count) => sum + count, 0),
			scopes: counts.size,
			ok: findings.length === 0,
			findings: [...findings],
		};
		debug("Check answered", {
			event: "check",
			ok: report.ok,
			findings: findings.length,
		});
		const text = isJson(args.flags)
			? print(report)
			: [
					`path: ${report.path}`,
					`records: ${report.records}`,
					`scopes: ${report.scopes}`,
					...(report.ok ? ["ok"] : findings),
				].join("\n");
		return { text, code: report.ok ? 0 : 1 };
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_checkCommand

// #region FUNC_repairCommand

/**
 * Rebuild the derived state of the store from the log.
 *
 * @purpose Turn a store with findings into a store that matches its log, so a user recovers
 * without an editor.
 * @invariants The command lists each applied change. The flag --dry-run lists the planned changes
 * and writes nothing.
 */
export async function repairCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const dryRun = args.flags["dry-run"] === true;
		const changes = check(runtime.store);
		debug("Repair done", { event: "repair", dryRun, changes: changes.length });
		return changes.length ? changes.join("\n") : "nothing to repair";
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_repairCommand

/** One command answer with its own exit code. */
export interface CommandAnswer {
	readonly text: string;
	readonly code: number;
}

// #region FUNC_exportCommand

/**
 * Export the store to files.
 *
 * @purpose Write one md file for each scope, or the jsonl transfer copy, so a user keeps a
 * readable view or moves a store.
 * @invariants The flags --format and --out are required. With no --scope, the md format writes
 * one file for each scope and the jsonl format copies the whole store. With --scope, both write
 * one scope. The jsonl copy of one scope also holds the top node of that scope.
 */
export async function exportCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const format = flagValue(args.flags, "format");
	const out = flagValue(args.flags, "out");
	if (format === null || (format !== "md" && format !== "jsonl"))
		throw new MemlensError("Usage", "The flag --format needs md or jsonl.");
	if (out === null) throw new MemlensError("Usage", "The command needs --out.");
	const scopeRaw = flagValue(args.flags, "scope");
	const scope =
		scopeRaw === null ? null : (normalizeScopeKey(scopeRaw) as ScopeKey);
	const runtime = await openCommandRuntime(args, io);
	try {
		mkdirSync(out, { recursive: true });
		const written: string[] = [];
		if (format === "jsonl") {
			const lines = exportLines(runtime.store);
			const name =
				scope === null ? "memlens.jsonl" : `${encodeStem(scope)}.jsonl`;
			writeFileSync(join(out, name), `${lines.join("\n")}\n`);
			written.push(`${name} (${lines.length} rows)`);
		} else {
			const scopes = scope === null ? runtimeVisibleScopes(runtime) : [scope];
			for (const key of scopes) {
				const records = scopeNotes(runtime.store, key);
				const name = encodeScopeFilename(key);
				writeFileSync(join(out, name), renderScopeMarkdown(key, records));
				written.push(`${name} (${records.length} records)`);
			}
		}
		debug("Export written", { event: "export", format, files: written.length });
		return written.map((line) => `wrote ${line}`).join("\n");
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_exportCommand

/** The encoded scope name without its extension. */
function encodeStem(scope: ScopeKey): string {
	return encodeScopeFilename(scope).slice(0, -".md".length);
}

// #region FUNC_importCommand

/**
 * Import events from one JSONL file.
 *
 * @purpose Join the events of one file into the store by id, so a user moves or merges a store.
 * @invariants The import joins by id and applies the erasure evidence of both sides. The flag
 * --as rewrites the scope of each imported non-catalog event to the given key. The flag
 * --dry-run validates and counts the change and writes nothing.
 */
export async function importCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const input = flagValue(args.flags, "in");
	if (input === null)
		throw new MemlensError("Usage", "The command needs --in.");
	const asRaw = flagValue(args.flags, "as");
	const as = asRaw === null ? null : (normalizeScopeKey(asRaw) as ScopeKey);
	const incoming = readLines(input);
	const runtime = await openCommandRuntime(args, io);
	try {
		const result = importLines(runtime.store, [...incoming], {
			dryRun: args.flags["dry-run"] === true,
			...(as === null ? {} : { as }),
		});
		const changed = result.applied + result.merged;
		debug("Import done", { event: "import", changed });
		return args.flags["dry-run"] === true
			? `would import ${changed} notes`
			: `imported ${changed} notes`;
	} finally {
		await runtime.close();
	}
}

// #endregion FUNC_importCommand

function readLines(path: string): readonly string[] {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
	return text
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => {
			try {
				JSON.parse(line);
				return line;
			} catch {
				throw new MemlensError("Data", `The file ${path} holds a bad line.`);
			}
		});
}

// #region FUNC_configCommand

/**
 * Read or write one configuration key.
 *
 * @purpose Show one value of config.toml, or set one value, so a user tunes the machine without
 * an editor.
 * @invariants The command opens no store. The set writes the file only after the complete result
 * passes the base load. A dotted path names one key of the configuration.
 */
export function configCommand(args: ParsedArgs, io: CommandIo): string {
	const action = args.positional[0];
	if (action !== "get" && action !== "set")
		throw new MemlensError("Usage", "The action must be get or set.");
	const key = args.positional[1];
	if (key === undefined)
		throw new MemlensError("Usage", "The command needs a key.");
	const { configDir, dataDir } = xdgDirs(io.env);
	const path = join(configDir, "config.toml");
	const raw = parseToml(readFileOr(path) ?? DEFAULT_CONFIG_TOML) as Record<
		string,
		unknown
	>;
	if (action === "get") {
		const value = walk(raw, key.split("."));
		debug("Config read", { event: "config", key });
		return `${key}: ${renderTomlValue(value)}`;
	}
	const value = args.positional[2];
	if (value === undefined)
		throw new MemlensError("Usage", "The command set needs a value.");
	const text = stringifyToml(setPath(raw, key.split("."), parseValue(value)));
	loadBaseConfig(text, dataDir);
	mkdirSync(configDir, { recursive: true });
	writeFileSync(path, text);
	debug("Config written", { event: "config", key, path });
	return `set ${key}`;
}

// #endregion FUNC_configCommand

function walk(value: unknown, path: readonly string[]): unknown {
	let current = value;
	for (const part of path) {
		if (typeof current !== "object" || current === null)
			throw new MemlensError("Data", `The key part ${part} is not a table.`);
		current = (current as Record<string, unknown>)[part];
		if (current === undefined)
			throw new MemlensError("Data", `The configuration holds no key ${part}.`);
	}
	return current;
}

function setPath(
	value: Record<string, unknown>,
	path: readonly string[],
	next: unknown,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...value };
	let current = result;
	for (const part of path.slice(0, -1)) {
		const child = current[part];
		if (typeof child !== "object" || child === null)
			throw new MemlensError("Data", `The key part ${part} is not a table.`);
		const copy = { ...(child as Record<string, unknown>) };
		current[part] = copy;
		current = copy;
	}
	current[path.at(-1) ?? ""] = next;
	return result;
}

function parseValue(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+$/.test(raw)) return Number(raw);
	return raw;
}

function renderTomlValue(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function readFileOr(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function readBodyFile(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
}
