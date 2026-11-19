/**
 * Write commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Save, correct, hide, redact, and review notes from the terminal, so a user curates the
 *   memory without a session.
 * @scope
 *  - The commands note, amend, forget, redact, and review.
 *  - NOT: the store rules, the argument parse, and the exit code mapping.
 * @invariants
 *  - The command note takes --scope, or the active scope of the directory with no flag. A target
 *    command takes the scope in the address or in --scope.
 *  - Each target scope must be visible in the profile, or the command gives NotAllowed.
 *  - Each supersedes address must resolve to a record id before the write.
 * @dependencies USES API: @memlens/core; WRITES: the store directory
 * @keywords note, amend, forget, redact, review, write, cli
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { debuglog } from "node:util";
import type { DueRecord, Note, NoteKind, ScopeKey } from "@memlens/core";
import {
	addDaysAtTime,
	amend,
	byAddress,
	dueRecords,
	hide,
	linkSupersedes,
	MemlensError,
	NOTE_KINDS,
	normalizeScopeKey,
	note,
	nowIso,
	parseAddress,
	redact,
	review,
	toIso,
} from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import {
	type CommandIo,
	countFlag,
	flagList,
	flagValue,
	isJson,
	openCommandRuntime,
	print,
	scopeList,
} from "./commands.js";
import { cliActiveScope, profileLists, type Runtime } from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_noteCommand
/**
 * Write one note.
 *
 * @purpose Save one curated note from the terminal, so a user records a fact without a session.
 * @invariants The body and the longform file content go to the store as given, and the store
 *   normalizes and splits them.
 */
export async function noteCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const kindRaw = flagValue(args.flags, "kind") ?? "note";
	if (!(NOTE_KINDS as readonly string[]).includes(kindRaw))
		throw new MemlensError("Usage", `The kind ${kindRaw} is unknown.`);
	const kind = kindRaw as NoteKind;
	const runtime = await openCommandRuntime(args, io);
	try {
		const scope = normalizeScopeKey(
			flagValue(args.flags, "scope") ?? cliActiveScope(runtime.base, io.cwd),
		) as ScopeKey;
		const supersedes = supersedeIds(runtime, args.flags, scope);
		const longformFile = flagValue(args.flags, "longform");
		const longform = longformFile === null ? null : readBodyFile(longformFile);
		const reviewAt = reviewFlag(
			args.flags,
			"review",
			runtime.config.review[kind],
		);
		const ts = tsFlag(args.flags);
		if (!profileLists(runtime, scope))
			throw new MemlensError("NotAllowed", "The scope is not listed.");
		const saved = note(runtime.store, {
			scope,
			body: args.positional[0] ?? "",
			kind,
			ts,
			review_at: reviewAt,
			session: "cli",
			turn: "cli",
			preset: "cli",
			...(longform === null ? {} : { longform }),
			...(supersedes.length === 0 ? {} : { supersedes }),
		});
		if (!saved.ok) throw new MemlensError("Data", "The note is a duplicate.");
		const pos = saved.value.pos;
		debug("Note saved", { event: "note", scope, pos });
		return `saved ${scope}#${pos} (${kind}) review ${reviewAt ?? "never"}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_noteCommand

// #region FUNC_resolveRowTarget
/** Resolve an address to one visible note row. */
function resolveRowTarget(
	runtime: Runtime,
	raw: string,
	fallback: string | null,
): { scope: ScopeKey; record: Note } {
	const address = parseAddress(raw);
	if (!address || address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", `The target ${raw} is not a note address.`);
	const scopeRaw = address.scope ?? fallback;
	if (scopeRaw === null)
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	const scope = normalizeScopeKey(scopeRaw) as ScopeKey;
	if (!runtime.scopes.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	const record = byAddress(runtime.store, scope, address.pos);
	if (record === null)
		throw new MemlensError("Data", `No note of ${scope} is at ${address.pos}.`);
	return { scope, record };
}
// #endregion FUNC_resolveRowTarget

// #region FUNC_supersedeIds
/** Resolve each --supersedes target to its row id. */
function supersedeIds(
	runtime: Runtime,
	flags: ParsedArgs["flags"],
	fallback: string | null,
): string[] {
	return flagList(flags, "supersedes")
		.flatMap((raw) => raw.split(","))
		.filter((raw) => raw !== "")
		.map((raw) => resolveRowTarget(runtime, raw, fallback).record.id);
}
// #endregion FUNC_supersedeIds

// #region FUNC_forgetCommand
/**
 * Hide one record.
 *
 * @purpose Remove one note from the view and keep it in the store, so a user curates without loss.
 */
export async function forgetCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
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
 *   from today, or the period of the kind of the record.
 */
export async function reviewCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const mark = flagValue(args.flags, "mark");
		if (mark !== null) return reviewMark(runtime, args, mark);
		const scopes = scopeList(args.flags);
		const due = dueRecords(
			runtime.store,
			scopes.length === 0 ? runtime.scopes : scopes,
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
 * @purpose Remove the content of one note from the store for good, so a user answers a request to
 *   be forgotten.
 * @invariants The command asks for a confirmation. The flag --yes skips the question.
 */
export async function redactCommand(
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(args, io);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
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
 *   destination scope, and it also names the current scope when the address holds none.
 * @invariants Supersede targets take the address form, and they resolve in the destination scope.
 *   Each target takes the amended note as its supersede link.
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
			args.positional[0] ?? "",
			destination,
		);
		const body = flagValue(args.flags, "body");
		const longformFile = flagValue(args.flags, "longform");
		const kindRaw = flagValue(args.flags, "kind");
		if (
			kindRaw !== null &&
			!(NOTE_KINDS as readonly string[]).includes(kindRaw)
		)
			throw new MemlensError("Usage", `The kind ${kindRaw} is unknown.`);
		const target =
			destination === null
				? scope
				: (normalizeScopeKey(destination) as ScopeKey);
		const supersedes = supersedeIds(runtime, args.flags, target);
		amend(runtime.store, {
			id: record.id,
			scope: target,
			...(body === null ? {} : { body }),
			...(longformFile === null
				? {}
				: { longform: readBodyFile(longformFile) }),
			...(kindRaw === null ? {} : { kind: kindRaw as NoteKind }),
		});
		if (supersedes.length > 0)
			linkSupersedes(runtime.store, record.id, supersedes);
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

// #region FUNC_reviewFlag
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
// #endregion FUNC_reviewFlag

// #region FUNC_tsFlag
/**
 * @purpose Read the flag --ts as the time of the note in the stored form.
 * @invariants An absent flag gives the write time.
 * @invariants A value that is not a date gives a Usage error.
 */
function tsFlag(flags: ParsedArgs["flags"]): string {
	const raw = flagValue(flags, "ts");
	if (raw === null) return nowIso();
	const time = Date.parse(raw);
	if (Number.isNaN(time))
		throw new MemlensError("Usage", "The flag --ts needs an ISO 8601 time.");
	return toIso(time);
}
// #endregion FUNC_tsFlag

function readBodyFile(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
}
