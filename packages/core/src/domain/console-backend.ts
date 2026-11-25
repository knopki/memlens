/**
 * #region moduleContract
 * @modulecontract
 * @purpose Apply each console edit and answer each console read, so both console hosts run one rule
 *   set.
 * @scope
 *  - The action dispatch, the edit handlers, the screen answers, the field text rule, and
 *    the scope check.
 *  - NOT: the transports, the scope resolution of one host, the host facts of the view answer, and
 *    the compaction job code.
 * @invariants A delete of one record or of one scope needs confirmation. An unknown action gives a
 *   Usage error.
 * @invariants The one-transaction proposal approval applies an ordinary operation and closes the
 *   proposal together.
 * @invariants A read answer holds no host fact. The host adds the profile names, the store path,
 *   and its delete permission.
 * @usecases
 *  - Amend: user => gives one target and a body => gets the changed note
 * @keywords console, backend, action, note, proposal, amend, forget, delete, view, search, open
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { ConsoleReader } from "../store/console.js";
import {
	amend,
	amendTx,
	hide,
	hideTx,
	linkSupersedes,
	type NoteInput,
	note,
	noteCheckedTx,
	redact,
	review,
	reviewTx,
} from "../store/notes.js";
import { accept, dismiss, pending } from "../store/proposals.js";
import { scopeNotes, supersedesOf } from "../store/reads.js";
import { search } from "../store/search.js";
import type { Store } from "../store/store.js";
import type { IndexHit, Note, NoteState, Proposal } from "../store/types.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import { NOTE_KINDS } from "../types/primitives.js";
import type { SliceLine } from "../types/tree.js";
import { parseAddress } from "./address.js";
import { globMatches } from "./config.js";
import type { ResolvedConfig } from "./config-types.js";
import type { ConsoleModel } from "./console.js";
import {
	CONSOLE_SCREENS,
	type ConsoleScreen,
	readConsole,
	readConsoleCatalog,
} from "./console.js";
import {
	filterHits,
	type OpenChildren,
	type OpenEntry,
	openNote,
} from "./reads.js";
import { isCatalogKey, validateScopeKey } from "./scope.js";
import { resolveTarget } from "./target.js";
import { addDaysAtTime, nowIso } from "./time.js";

const debug = debuglog("memlens:console");

// #region INTERFACE_ConsoleHost
/** @purpose Give the backend one store, one resolved configuration, and the visible scopes of one
 *   host. */
export interface ConsoleHost {
	readonly store: Store;
	readonly config: ResolvedConfig;
	readonly scopes: readonly ScopeKey[];
}
// #endregion INTERFACE_ConsoleHost

/** One request field map of a console transport. */
export type Fields = Record<string, unknown>;

/** The answer of one console action, by the action that gives it. */
export type ConsoleActionAnswer =
	| { duplicate: true }
	| { id: string }
	| { ok: true }
	| { changed: number };

// #region FUNC_text
/** @purpose Give one text field of the request, so a value of a wrong type gives a Usage error. */
export function text(fields: Fields, key: string): string {
	const value = fields[key];
	if (value === undefined) return "";
	if (typeof value !== "string")
		throw new MemlensError("Usage", `The field ${key} must be text.`);
	return value;
}
// #endregion FUNC_text

// #region FUNC_allowedScope
/** @purpose Refuse a scope outside the profile of the host, so one request changes no record of
 *   another profile. */
export function allowedScope(host: ConsoleHost, raw: string): ScopeKey {
	if (!validateScopeKey(raw))
		throw new MemlensError("Usage", "The scope key is invalid.");
	const key = raw as ScopeKey;
	if (
		isCatalogKey(key) ||
		!host.config.profile.scopes.some((glob) => globMatches(glob, raw))
	)
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return key;
}
// #endregion FUNC_allowedScope

function noteKind(raw: string): NoteKind {
	if (!(NOTE_KINDS as readonly string[]).includes(raw))
		throw new MemlensError("Usage", "The kind is unknown.");
	return raw as NoteKind;
}

function targetRecord(
	host: ConsoleHost,
	fallback: ScopeKey,
	target: string,
): Note {
	try {
		return resolveTarget(host.store, fallback, target, (raw) =>
			allowedScope(host, raw),
		);
	} catch (error) {
		if (error instanceof MemlensError && error.code === "Data")
			throw new MemlensError("Data", "The note does not exist.");
		throw error;
	}
}

/** The transaction type that the store gives to one proposal handler. */
type ProposalTx = Parameters<Parameters<typeof accept>[2]>[1];

/** The payload of one pending proposal. */
interface ProposalPayload {
	readonly body?: string;
	readonly kind?: NoteKind;
	readonly scope?: ScopeKey;
	readonly review_at?: string | null;
	readonly ts?: string;
	readonly longform?: string;
	readonly supersedes?: readonly string[];
	readonly session?: string;
}

// #region FUNC_consoleAction
/** @purpose Send each action to one handler, so no host holds an edit rule. */
export function consoleAction(
	host: ConsoleHost,
	fields: Fields,
	scope: ScopeKey,
): ConsoleActionAnswer {
	const action = text(fields, "action");
	debug("Action start", { event: "action", action, scope });
	if (
		(action === "delete" || action === "scope-delete") &&
		fields.confirm !== true
	)
		throw new MemlensError("NotAllowed", "Delete needs confirmation.");
	if (action === "note") return applyNote(host, scope, fields);
	if (action === "accept" || action === "dismiss")
		return applyProposal(host, fields, action);
	if (action === "scope-forget" || action === "scope-delete")
		return applyScopeAction(host, scope, fields, action);
	return applyRecordAction(host, scope, fields, action);
}
// #endregion FUNC_consoleAction

// #region FUNC_applyNote
/** @purpose Save one note of the console, so a human writes through the store rules. */
function applyNote(
	host: ConsoleHost,
	scope: ScopeKey,
	fields: Fields,
): ConsoleActionAnswer {
	const kind = noteKind(text(fields, "kind") || "note");
	const supersedes = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.map((target) => targetRecord(host, scope, target).id);
	const saved = note(host.store, {
		scope,
		body: text(fields, "body"),
		kind,
		longform: text(fields, "longform"),
		...(supersedes.length ? { supersedes } : {}),
		ts: nowIso(),
		review_at: addDaysAtTime(Date.now(), host.config.review[kind]),
		session: "ui",
		turn: "ui",
		preset: "ui",
	});
	debug("Note saved", { event: "note", scope, kind, duplicate: !saved.ok });
	if (!saved.ok) return { duplicate: true };
	return { id: saved.value.id };
}
// #endregion FUNC_applyNote

// #region FUNC_applyProposal
/**
 * @purpose Accept or dismiss one pending proposal.
 * @invariants An accept applies its operation and closes the proposal in one store transaction.
 */
function applyProposal(
	host: ConsoleHost,
	fields: Fields,
	action: string,
): ConsoleActionAnswer {
	const proposal = pending(host.store).find(
		(item) => item.id === text(fields, "target"),
	);
	if (!proposal)
		throw new MemlensError("Data", "The proposal is no longer pending.");
	if (action === "dismiss") {
		dismiss(host.store, proposal.id);
		return { ok: true };
	}
	accept(
		host.store,
		proposal.id,
		(payload, tx) => applyAccepted(proposal, payload, tx),
		[...host.scopes, proposal.scope],
	);
	debug("Proposal accepted", { event: "accept", op: proposal.op });
	return { ok: true };
}
// #endregion FUNC_applyProposal

// #region FUNC_applyAccepted
/**
 * @purpose Apply the payload of one accepted proposal inside its transaction.
 * @invariants An op with no target writes nothing, so a lost target fails the accept instead of a
 *   silent write.
 */
function applyAccepted(
	proposal: Proposal,
	payload: unknown,
	tx: ProposalTx,
): void {
	const data = payload as ProposalPayload;
	if (proposal.op === "note") {
		noteCheckedTx(tx, acceptedNote(proposal, data));
		return;
	}
	if (!proposal.target) return;
	const target = proposal.target as Note["id"];
	if (proposal.op === "supersede")
		noteCheckedTx(tx, acceptedSupersede(proposal, data));
	else if (proposal.op === "hide") hideTx(tx, { id: target });
	else if (proposal.op === "review")
		reviewTx(tx, { id: target, reviewAt: data.review_at ?? null });
	else if (proposal.op === "amend")
		amendTx(tx, {
			id: target,
			...(data.body ? { body: data.body } : {}),
			...(data.longform ? { longform: data.longform } : {}),
			...(data.scope ? { scope: data.scope } : {}),
		});
}
// #endregion FUNC_applyAccepted

function acceptedNote(proposal: Proposal, data: ProposalPayload): NoteInput {
	return {
		scope: proposal.scope,
		body: data.body ?? "",
		kind: data.kind ?? "note",
		ts: data.ts ?? nowIso(),
		review_at: data.review_at ?? null,
		session: "ui",
		turn: "ui",
		preset: "ui",
		...(data.longform ? { longform: data.longform } : {}),
		...(data.supersedes?.length ? { supersedes: data.supersedes } : {}),
	};
}

function acceptedSupersede(proposal: Proposal, payload: unknown): NoteInput {
	const data = payload as {
		scope: ScopeKey;
		body: string;
		kind: NoteKind;
		review_at?: string | null;
		longform?: string;
	};
	return {
		scope: data.scope,
		body: data.body,
		kind: data.kind,
		review_at: data.review_at ?? null,
		session: "ui",
		turn: "ui",
		preset: "ui",
		supersedes: [proposal.target as Note["id"]],
		...(data.longform ? { longform: data.longform } : {}),
	};
}

// #region FUNC_applyScopeAction
/** @purpose Hide or erase each note of one scope after one confirmation. */
function applyScopeAction(
	host: ConsoleHost,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): ConsoleActionAnswer {
	if (fields.confirm !== true)
		throw new MemlensError(
			"NotAllowed",
			"The scope action needs confirmation.",
		);
	const rows = scopeNotes(host.store, scope).filter((row) =>
		action === "scope-delete" ? row.state !== "deleted" : row.state === "live",
	);
	for (const row of rows) {
		if (action === "scope-delete")
			redact(host.store, row.id, "ui scope action");
		else hide(host.store, row.id, "ui scope action");
	}
	debug("Scope action applied", {
		event: "scope-action",
		action,
		rows: rows.length,
	});
	return { changed: rows.length };
}
// #endregion FUNC_applyScopeAction

// #region FUNC_applyRecordAction
/** @purpose Apply one action to one record. */
function applyRecordAction(
	host: ConsoleHost,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): ConsoleActionAnswer {
	const record = targetRecord(host, scope, text(fields, "target"));
	switch (action) {
		case "amend":
			amendRecord(host, record, fields);
			break;
		case "review":
			review(
				host.store,
				record.id,
				addDaysAtTime(Date.now(), host.config.review[record.kind]),
			);
			break;
		case "forget":
			hide(host.store, record.id, "ui action");
			break;
		case "delete":
			redact(host.store, record.id, "ui action");
			break;
		default:
			throw new MemlensError("Usage", "The action is unknown.");
	}
	debug("Action done", { event: "applied", action, id: record.id });
	return { ok: true };
}
// #endregion FUNC_applyRecordAction

// #region FUNC_amendRecord
/** @purpose Change the body, the longform, the kind, the scope, or the supersedes of one note. */
function amendRecord(host: ConsoleHost, record: Note, fields: Fields): void {
	const destination = text(fields, "dest") || record.scope;
	const kind = text(fields, "kind");
	const targets = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	if (targets.length > 0)
		linkSupersedes(
			host.store,
			record.id,
			targets.map(
				(target) =>
					targetRecord(host, allowedScope(host, destination), target).id,
			),
		);
	amend(host.store, {
		id: record.id,
		scope: allowedScope(host, destination),
		body: text(fields, "body"),
		longform: text(fields, "longform"),
		...(kind ? { kind: noteKind(kind) } : {}),
	});
}
// #endregion FUNC_amendRecord

// #region INTERFACE_ConsoleViewAnswer
/** @purpose Give the view answer of one console, before one host adds its own facts. */
export interface ConsoleViewAnswer extends ConsoleModel {
	readonly proposals?: readonly Proposal[];
	readonly backend: string;
	readonly reviewPolicy?: ResolvedConfig["review"];
}
// #endregion INTERFACE_ConsoleViewAnswer

// #region FUNC_consoleView
/** @purpose Give the console model of one scope with its proposals and its policy. */
export async function consoleView(
	host: ConsoleHost,
	fields: Fields,
	scope: ScopeKey,
): Promise<ConsoleViewAnswer> {
	const kind = text(fields, "kind");
	const screen = text(fields, "screen") || "overview";
	if (!(CONSOLE_SCREENS as readonly string[]).includes(screen))
		throw new MemlensError("Usage", "The screen is unknown.");
	const model = await readConsole(
		host.store,
		host.config,
		scope,
		undefined,
		kind ? noteKind(kind) : null,
		screen as ConsoleScreen,
	);
	debug("View answered", { event: "view", scope, kind, screen });
	return {
		...model,
		...(screen === "proposals" ? { proposals: pending(host.store) } : {}),
		backend: "sqlite",
		...(screen === "review" ? { reviewPolicy: host.config.review } : {}),
	};
}
// #endregion FUNC_consoleView

// #region FUNC_consoleSearch
/** @purpose Answer one search over the requested scope or each visible scope. */
export function consoleSearch(
	host: ConsoleHost,
	fields: Fields,
	scope: ScopeKey,
): readonly IndexHit[] {
	const raw = text(fields, "limit") || "10";
	if (!/^\d+$/.test(raw))
		throw new MemlensError("Usage", "The limit must be a whole number from 0.");
	const scopes = text(fields, "scope") ? [scope] : host.scopes;
	const hits = scopes.flatMap((key) =>
		search(host.store, text(fields, "query"), key, 50),
	);
	const kind = text(fields, "kind");
	const answer = filterHits(
		hits,
		{
			scopes,
			limit: Number(raw),
			since: text(fields, "since"),
			...(kind ? { kinds: [noteKind(kind)] } : {}),
		},
		nowIso(),
	);
	debug("Search answered", {
		event: "search",
		scopes: scopes.length,
		hits: answer.length,
	});
	return answer;
}
// #endregion FUNC_consoleSearch

// #region INTERFACE_ConsoleEntry
/** @purpose Give the console inspector and editor all fields of one opened note. */
export interface ConsoleEntry extends OpenEntry {
	readonly noteKind: NoteKind;
	readonly state: NoteState;
	readonly session: string;
	readonly preset: string;
	readonly supersedes: readonly string[];
	readonly superseded_by: string | null;
}
// #endregion INTERFACE_ConsoleEntry

// #region INTERFACE_ConsoleChildren
/** @purpose Give the console the text and children of one selected range. */
export interface ConsoleChildren extends OpenChildren {
	readonly text: string;
}
// #endregion INTERFACE_ConsoleChildren

// #region FUNC_consoleOpen
/** @purpose Give one note with its document, or the children of one range. */
export function consoleOpen(
	host: ConsoleHost,
	fields: Fields,
	scope: ScopeKey,
): ConsoleEntry | ConsoleChildren {
	return host.store.read(() => {
		const address = parseAddress(text(fields, "target"));
		if (!address)
			throw new MemlensError("Usage", "The target must be an address.");
		const key = allowedScope(host, address.scope ?? scope);
		if (address.kind === "range" || address.kind === "scoped-range")
			return {
				kind: "children",
				...new ConsoleReader(host.store.handle(), key).children(
					address.start,
					address.end,
				),
			};
		const row = targetRecord(host, scope, text(fields, "target"));
		const offset = Number(text(fields, "offset") || "0");
		if (!Number.isInteger(offset) || offset < 0)
			throw new MemlensError(
				"Usage",
				"The offset must be a whole number from 0.",
			);
		debug("Open answered", {
			event: "open",
			scope: key,
			pos: address.pos,
			offset,
		});
		return {
			...openNote(key, row, "all", offset),
			noteKind: row.kind,
			state: row.state,
			session: row.session,
			preset: row.preset,
			supersedes: supersedesOf(host.store, row.id),
			superseded_by: row.superseded_by,
		};
	});
}
// #endregion FUNC_consoleOpen

// #region FUNC_consoleCatalog
/** @purpose Give the catalog lines below one range, so the console draws one level. */
export async function consoleCatalog(
	host: ConsoleHost,
	fields: Fields,
	scope: ScopeKey,
): Promise<readonly SliceLine[]> {
	const start = Number(text(fields, "start"));
	const level = Number(text(fields, "level"));
	if (
		!Number.isInteger(start) ||
		start < 0 ||
		!Number.isInteger(level) ||
		level < 1
	)
		throw new MemlensError("Usage", "The catalog target must be a range.");
	debug("Catalog answered", { event: "catalog", start, level });
	return readConsoleCatalog(host.store, host.config, scope, start, level);
}
// #endregion FUNC_consoleCatalog
