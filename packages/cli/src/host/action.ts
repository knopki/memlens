/**
 * Console action route.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Apply one human edit to the memory, so a user curates the store from the browser.
 * @scope
 *  - One handler for each action: the note, the proposal answer, the scope action, the record
 *    action, and the compaction.
 *  - NOT: the store rules, the transport, and the read routes.
 * @usecases
 *  - Amend: user => gives one target and a body => gets the changed note
 * @dependencies USES API: @memlens/core, host/http.ts, host/scope.ts, host/compact.ts
 * @keywords ui, action, note, proposal, amend, forget, delete, scope
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type {
	Note,
	NoteInput,
	NoteKind,
	Proposal,
	ScopeKey,
} from "@memlens/core";
import {
	accept,
	addDaysAtTime,
	amend,
	amendTx,
	dismiss,
	hide,
	hideTx,
	linkSupersedes,
	MemlensError,
	note,
	noteCheckedTx,
	nowIso,
	pending,
	redact,
	review,
	reviewTx,
	scopeNotes,
} from "@memlens/core";
import type { Runtime } from "../runtime.js";
import { compactAction } from "./compact.js";
import { type Fields, type HostOptions, text } from "./http.js";
import { allowedScope, noteKind, targetRecord } from "./scope.js";

const debug = debuglog("memlens:ui");

/** The transaction type that the store gives to one proposal handler. */
type ProposalTx = Parameters<Parameters<typeof accept>[2]>[1];

/** The payload of one pending proposal. */
interface ProposalPayload {
	readonly body?: string;
	readonly kind?: NoteKind;
	readonly scope?: ScopeKey;
	readonly review_at?: string | null;
	readonly longform?: string;
}

// #region FUNC_actionRoute
/**
 * Apply one action of the console.
 *
 * @purpose Send each action to one handler, so the route holds no edit rule.
 * @invariants A delete of one record or of one scope needs --allow-delete and confirmation. An
 *   unknown action gives a Usage error.
 */
export async function actionRoute(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
	options: HostOptions,
): Promise<unknown> {
	const action = text(fields, "action");
	debug("Action start", { event: "action", action, scope });
	if (action === "compact" || action === "compact-answer")
		return compactAction(runtime, scope, fields);
	if (
		(action === "delete" || action === "scope-delete") &&
		(options.allowDelete !== true || fields.confirm !== true)
	)
		throw new MemlensError(
			"NotAllowed",
			"Delete needs --allow-delete and confirmation.",
		);
	if (action === "note") return applyNote(runtime, scope, fields);
	if (action === "accept" || action === "dismiss")
		return applyProposal(runtime, fields, action);
	if (action === "scope-forget" || action === "scope-delete")
		return applyScopeAction(runtime, scope, fields, action);
	return applyRecordAction(runtime, scope, fields, action);
}
// #endregion FUNC_actionRoute

// #region FUNC_applyNote
/**
 * @purpose Save one note of the console, so the browser writes through the store rules.
 * @invariants A duplicate gives no error, and the answer holds the duplicate flag.
 */
function applyNote(runtime: Runtime, scope: ScopeKey, fields: Fields): unknown {
	const kind = noteKind(text(fields, "kind") || "note");
	const supersedes = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.map((target) => targetRecord(runtime, scope, target).id);
	const saved = note(runtime.store, {
		scope,
		body: text(fields, "body"),
		kind,
		longform: text(fields, "longform"),
		...(supersedes.length ? { supersedes } : {}),
		ts: nowIso(),
		review_at: addDaysAtTime(Date.now(), runtime.config.review[kind]),
		session: "ui",
		turn: "ui",
		preset: "ui",
	});
	if (!saved.ok) return { duplicate: true };
	return { id: saved.value.id };
}
// #endregion FUNC_applyNote

// #region FUNC_applyProposal
/**
 * Accept or dismiss one pending proposal.
 *
 * @purpose Apply one proposal in one store transaction, so a proposal changes the memory once.
 * @invariants A proposal that is no longer pending gives a Data error.
 */
function applyProposal(
	runtime: Runtime,
	fields: Fields,
	action: string,
): unknown {
	const proposal = pending(runtime.store).find(
		(item) => item.id === text(fields, "target"),
	);
	if (!proposal)
		throw new MemlensError("Data", "The proposal is no longer pending.");
	if (action === "dismiss") {
		dismiss(runtime.store, proposal.id);
		return { ok: true };
	}
	accept(
		runtime.store,
		proposal.id,
		(payload, tx) => applyAccepted(proposal, payload, tx),
		[...runtime.scopes, proposal.scope],
	);
	return { ok: true };
}
// #endregion FUNC_applyProposal

/** @purpose Apply the payload of one accepted proposal inside its transaction. */
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
	if (proposal.op === "hide") hideTx(tx, { id: target });
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

/** The new note of one accepted note proposal. */
function acceptedNote(proposal: Proposal, data: ProposalPayload): NoteInput {
	return {
		scope: proposal.scope,
		body: data.body ?? "",
		kind: data.kind ?? "note",
		ts: nowIso(),
		review_at: data.review_at ?? null,
		session: "ui",
		turn: "ui",
		preset: "ui",
		...(data.longform ? { longform: data.longform } : {}),
	};
}

/** The new note of one accepted supersede proposal. */
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
/**
 * Hide or erase each note of one scope.
 *
 * @purpose Apply one scope action after one confirmation, so a user clears a scope in one step.
 * @invariants The action needs confirmation. A delete erases only the notes that are not deleted.
 */
function applyScopeAction(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): unknown {
	if (fields.confirm !== true)
		throw new MemlensError(
			"NotAllowed",
			"The scope action needs confirmation.",
		);
	const rows = scopeNotes(runtime.store, scope).filter((row) =>
		action === "scope-delete" ? row.state !== "deleted" : row.state === "live",
	);
	for (const row of rows)
		action === "scope-delete"
			? redact(runtime.store, row.id, "ui scope action")
			: hide(runtime.store, row.id, "ui scope action");
	return { changed: rows.length };
}
// #endregion FUNC_applyScopeAction

// #region FUNC_applyRecordAction
/**
 * Apply one action to one record.
 *
 * @purpose Change, review, hide, or erase one note, so one target covers each edit of one row.
 * @invariants An action outside the four record actions gives a Usage error.
 */
function applyRecordAction(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): unknown {
	const record = targetRecord(runtime, scope, text(fields, "target"));
	switch (action) {
		case "amend":
			amendRecord(runtime, record, fields);
			break;
		case "review":
			review(
				runtime.store,
				record.id,
				addDaysAtTime(Date.now(), runtime.config.review[record.kind]),
			);
			break;
		case "forget":
			hide(runtime.store, record.id, "ui action");
			break;
		case "delete":
			redact(runtime.store, record.id, "ui action");
			break;
		default:
			throw new MemlensError("Usage", "The action is unknown.");
	}
	debug("Action done", { event: "applied", action, id: record.id });
	return { ok: true };
}
// #endregion FUNC_applyRecordAction

// #region FUNC_amendRecord
/**
 * Change the body, the longform, the kind, the scope, or the supersedes of one note.
 *
 * @purpose Apply one amendment with its supersede links in one place.
 * @invariants The supersede targets resolve in the destination scope before the write.
 */
function amendRecord(runtime: Runtime, record: Note, fields: Fields): void {
	const destination = text(fields, "dest") || record.scope;
	const kind = text(fields, "kind");
	const targets = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	if (targets.length > 0)
		linkSupersedes(
			runtime.store,
			record.id,
			targets.map(
				(target) =>
					targetRecord(runtime, allowedScope(runtime, destination), target).id,
			),
		);
	amend(runtime.store, {
		id: record.id,
		scope: allowedScope(runtime, destination),
		body: text(fields, "body"),
		longform: text(fields, "longform"),
		...(kind ? { kind: noteKind(kind) } : {}),
	});
}
// #endregion FUNC_amendRecord
