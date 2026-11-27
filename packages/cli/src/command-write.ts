/**
 * Write commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Save, correct, hide, redact, and review notes from the terminal, so a user curates the
 *   memory without a session.
 * @scope
 *  - The commands note, amend, move, forget, restore, redact, and review.
 *  - NOT: the store rules, the argument parse, and the exit code mapping.
 * @invariants
 *  - The command note takes --scope, or the active scope of the directory with no flag. A target
 *    command takes the scope in the address or in --scope.
 *  - Each target scope must be visible in the profile, or the command gives NotAllowed. The
 *    command restore takes each valid scope, because only the CLI restores.
 *  - Each supersedes address must resolve to a record id before the write.
 * @dependencies USES API: @memlens/core, commander; WRITES: the store directory
 * @keywords note, amend, forget, restore, redact, review, write, cli
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { debuglog } from "node:util";
import type { DueRecord, Note, NoteKind, ScopeKey } from "@memlens/core";
import {
	addDaysAtTime,
	amend,
	dayOf,
	dueRecords,
	hide,
	linkSupersedes,
	MemlensError,
	move,
	normalizeScopeKey,
	note,
	nowIso,
	redact,
	resolveTarget,
	restore,
	review,
	validateScopeKey,
} from "@memlens/core";
import type { Command } from "commander";
import {
	addressList,
	type CommandIo,
	checkedScope,
	command,
	DRY_RUN,
	JSON_FLAG,
	KIND,
	limit,
	noteTime,
	openCommandRuntime,
	period,
	print,
	REASON,
	type Run,
	reply,
	SCOPE,
	SCOPES,
	STORE,
	scopeList,
} from "./commands.js";
import { cliActiveScope, profileLists, type Runtime } from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_commands
/**
 * @purpose Declare the signature and the flags of each write command once, so the help comes from
 *   the same place as the parse.
 */
export function commands(run: Run): Command[] {
	const io = run.io;
	return [
		command("note <body>", "Save one note.")
			.addOption(SCOPE)
			.option("--longform <file>", "A file with the long text of the note.")
			.addOption(KIND)
			.option(
				"--supersedes <addresses>",
				"The addresses of the records that the note supersedes, in the form 12,14.",
				addressList,
			)
			.option(
				"--review <period>",
				"The review period: a number of days with the letter d, or never. The period of the kind applies without the flag.",
				period,
			)
			.option(
				"--ts <time>",
				"The time of the note: a day or an ISO 8601 time. The write time applies without the flag.",
				noteTime,
			)
			.addOption(STORE)
			.action((body: string, options) =>
				reply(run, noteCommand({ ...options, body }, io)),
			),
		command("forget <target>", "Hide one record.")
			.addOption(SCOPE)
			.addOption(REASON)
			.addOption(STORE)
			.action((target: string, options) =>
				reply(run, forgetCommand({ ...options, target }, io)),
			),
		command("restore <target>", "Restore one hidden record.")
			.addOption(SCOPE)
			.addOption(REASON)
			.addOption(STORE)
			.action((target: string, options) =>
				reply(run, restoreCommand({ ...options, target }, io)),
			),
		command("review", "List the notes that are due, or mark them as reviewed.")
			.addOption(SCOPES)
			.addOption(limit(50))
			.addOption(JSON_FLAG)
			.option(
				"--mark <addresses>",
				"The addresses of the records to mark, in the form 12,14. The command marks the records and lists none.",
				addressList,
			)
			.option(
				"--for <period>",
				"The review period of the marked records: a number of days with the letter d, or never. The period of the kind of each record applies without the flag.",
				period,
			)
			.addOption(STORE)
			.action((options) => reply(run, reviewCommand(options, io))),
		command("redact <target>", "Erase the content of one record for good.")
			.addOption(SCOPE)
			.addOption(REASON)
			.option("-y, --yes", "Skip the confirmation.")
			.addOption(STORE)
			.action((target: string, options) =>
				reply(run, redactCommand({ ...options, target }, io)),
			),
		command("amend <target>", "Change the content or the scope of one record.")
			.option(
				"-s, --scope <key>",
				"The destination scope of the record. It also names the current scope of an address without a scope.",
			)
			.option("--body <text>", "The new text of the record.")
			.option(
				"--longform <file>",
				"A file with the new long text of the record.",
			)
			.addOption(KIND)
			.option(
				"--supersedes <addresses>",
				"The addresses of the records that the record supersedes, in the form 12,14.",
				addressList,
			)
			.addOption(STORE)
			.action((target: string, options) =>
				reply(run, amendCommand({ ...options, target }, io)),
			),
		command(
			"move <source> <destination>",
			"Move each note of one scope to another scope.",
		)
			.addOption(DRY_RUN)
			.addOption(STORE)
			.action((source: string, destination: string, options) =>
				reply(run, moveCommand({ ...options, source, destination }, io)),
			),
	];
}
// #endregion FUNC_commands

// #region FUNC_noteCommand
/**
 * Write one note.
 *
 * @purpose Save one curated note from the terminal, so a user records a fact without a session.
 * @invariants The body and the longform file content go to the store as given, and the store
 *   normalizes and splits them. The kind is note without the flag.
 */
export async function noteCommand(
	input: {
		body: string;
		scope?: string;
		longform?: string;
		kind?: NoteKind;
		supersedes?: string[];
		review?: string;
		ts?: string;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const scope = normalizeScopeKey(
			input.scope ?? cliActiveScope(runtime.base, io.cwd),
		) as ScopeKey;
		const supersedes = (input.supersedes ?? []).map(
			(address) => resolveRowTarget(runtime, address, scope).record.id,
		);
		const longform =
			input.longform === undefined ? null : readBodyFile(input.longform);
		const kind = input.kind ?? "note";
		const reviewAt = nextReview(input.review, runtime.config.review[kind]);
		if (!profileLists(runtime, scope))
			throw new MemlensError("NotAllowed", "The scope is not listed.");
		const saved = note(runtime.store, {
			scope,
			body: input.body,
			kind,
			ts: input.ts ?? nowIso(),
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

function resolveRowTarget(
	runtime: Runtime,
	raw: string,
	fallback: string | null,
): { scope: ScopeKey; record: Note } {
	const record = resolveTarget(runtime.store, fallback, raw, (scope) =>
		checkedScope(runtime, scope),
	);
	return { scope: record.scope, record };
}

// #region FUNC_forgetCommand
/**
 * Hide one record.
 *
 * @purpose Remove one note from the view and keep it in the store, so a user curates without loss.
 */
export async function forgetCommand(
	input: { target: string; scope?: string; reason?: string; store?: string },
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			input.target,
			input.scope ?? null,
		);
		hide(runtime.store, record.id, input.reason ?? "cli forget");
		debug("Record hidden", { event: "forget", scope, pos: record.pos });
		return `hidden ${scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_forgetCommand

// #region FUNC_restoreCommand
/**
 * @purpose Let an operator undo a hide outside the profile scope list.
 */
export async function restoreCommand(
	input: { target: string; scope?: string; reason?: string; store?: string },
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const record = resolveTarget(
			runtime.store,
			input.scope ?? null,
			input.target,
			(raw) => {
				const scope = normalizeScopeKey(raw) as ScopeKey;
				if (!validateScopeKey(scope))
					throw new MemlensError("Data", "The scope key is not valid.");
				return scope;
			},
		);
		restore(runtime.store, record.id, input.reason ?? "cli restore");
		debug("Record restored", {
			event: "restore",
			scope: record.scope,
			pos: record.pos,
		});
		return `restored ${record.scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_restoreCommand

// #region FUNC_reviewCommand
/**
 * List the due records, or mark records as reviewed.
 *
 * @purpose Give the review list or set the next review date, so a user keeps the memory current.
 * @invariants The list uses each visible scope with no --scope. The mark sets the date --for days
 *   from today, or the period of the kind of the record.
 */
export async function reviewCommand(
	input: {
		scope?: string[];
		limit: number;
		json?: boolean;
		mark?: string[];
		for?: string;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		if ((input.mark ?? []).length > 0) return reviewMark(runtime, input);
		const scopes = scopeList(input.scope ?? []);
		const due = dueRecords(
			runtime.store,
			scopes.length === 0 ? runtime.scopes : scopes,
			nowIso(),
		).slice(0, input.limit);
		debug("Review listed", { event: "review", due: due.length });
		return input.json ? print(due) : due.map(renderDue).join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_reviewCommand

function renderDue(record: DueRecord): string {
	return `${record.addr}  ${record.review_at ? dayOf(record.review_at) : "never"}  ${record.kind}  ${record.body}`;
}

async function reviewMark(
	runtime: Runtime,
	input: { mark?: string[]; scope?: string[]; for?: string },
): Promise<string> {
	const answers: string[] = [];
	for (const address of input.mark ?? []) {
		const { scope, record } = resolveRowTarget(
			runtime,
			address,
			input.scope?.[0] ?? null,
		);
		const reviewAt = nextReview(input.for, runtime.config.review[record.kind]);
		review(runtime.store, record.id, reviewAt);
		answers.push(
			`reviewed ${scope}#${record.pos} -> ${reviewAt === null ? "never" : dayOf(reviewAt)}`,
		);
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
	input: {
		target: string;
		scope?: string;
		reason?: string;
		yes?: boolean;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			input.target,
			input.scope ?? null,
		);
		const proceed =
			input.yes === true ||
			(await io.confirm(
				`Redact ${scope}#${record.pos}? This erases the content for good.`,
			));
		if (!proceed) {
			debug("Redact cancelled", { event: "redact", scope, pos: record.pos });
			return "cancelled";
		}
		redact(runtime.store, record.id, input.reason ?? "cli redact");
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
	input: {
		target: string;
		scope?: string;
		body?: string;
		longform?: string;
		kind?: NoteKind;
		supersedes?: string[];
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const { scope, record } = resolveRowTarget(
			runtime,
			input.target,
			input.scope ?? null,
		);
		const target =
			input.scope === undefined
				? scope
				: (normalizeScopeKey(input.scope) as ScopeKey);
		const supersedes = (input.supersedes ?? []).map(
			(address) => resolveRowTarget(runtime, address, target).record.id,
		);
		amend(runtime.store, {
			id: record.id,
			scope: target,
			...(input.body === undefined ? {} : { body: input.body }),
			...(input.longform === undefined
				? {}
				: { longform: readBodyFile(input.longform) }),
			...(input.kind === undefined ? {} : { kind: input.kind }),
		});
		if (supersedes.length > 0)
			linkSupersedes(runtime.store, record.id, supersedes);
		debug("Record amended", {
			event: "amend",
			scope,
			pos: record.pos,
			kind: input.kind,
			supersedes: supersedes.length,
		});
		return `amended ${scope}#${record.pos}`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_amendCommand

// #region FUNC_moveCommand
/**
 * @purpose Move a scope from the terminal, so a user corrects many notes with one command.
 * @invariants Both scope keys must match the profile, including an empty destination or source.
 * @invariants The answer names both scopes, the moved count, and each cleared source address.
 */
export async function moveCommand(
	input: {
		source: string;
		destination: string;
		dryRun?: boolean;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const source = normalizeScopeKey(input.source) as ScopeKey;
	const destination = normalizeScopeKey(input.destination) as ScopeKey;
	if (!validateScopeKey(source) || !validateScopeKey(destination))
		throw new MemlensError("Data", "The scope key is not valid.");
	const runtime = await openCommandRuntime(io, input.store);
	try {
		for (const scope of [source, destination]) {
			if (!profileLists(runtime, scope))
				throw new MemlensError(
					"NotAllowed",
					`The scope ${scope} is not listed.`,
				);
		}
		const dryRun = input.dryRun === true;
		const result = move(runtime.store, source, destination, { dryRun });
		return [
			`${dryRun ? "would move" : "moved"} ${result.moved} notes from ${source} to ${destination}`,
			...result.skipped.map((pos) => `skipped cleared ${source}#${pos}`),
		].join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_moveCommand

// #region FUNC_nextReview
/**
 * @purpose Read --review or --for with one rule, so each command sets the same date for one period.
 */
function nextReview(
	period: string | undefined,
	fallbackDays: number,
): string | null {
	if (period === undefined) return addDaysAtTime(Date.now(), fallbackDays);
	return period === "never"
		? null
		: addDaysAtTime(Date.now(), Number(period.slice(0, -1)));
}
// #endregion FUNC_nextReview

function readBodyFile(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
}
