/**
 * #region moduleContract
 * @purpose Apply one human edit to the memory, so a user curates the store from the tab.
 * @scope
 *  - One handler for each action: the note, the proposal answer, the scope action, the record
 *    action, and the compaction.
 *  - NOT: the store rules, the transport, the read routes, and the compaction job code.
 * @usecases
 *  - Amend: user => gives one target and a body => gets the changed note
 * @invariants The one-transaction proposal approval applies an ordinary operation and closes the
 *   proposal together.
 * @invariants The plugin host permits a delete, because the route checked the connection. A
 *   delete still needs confirmation.
 * @dependencies USES API: @memlens/core, scope.ts, compact.ts, ../tools/shared.ts
 * @keywords console, action, note, proposal, amend, forget, delete, scope
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
import type { AgentMemory } from "../service.js";
import { visibleScopeList } from "../tools/shared.js";
import { compactAction } from "./compact.js";
import {
	allowedScope,
	type ConsoleRequest,
	type Fields,
	noteKind,
	targetRecord,
	text,
} from "./scope.js";

const debug = debuglog("memlens:plugin:console");

/** The transaction type that the store gives to one proposal handler. */
type ProposalTx = Parameters<Parameters<typeof accept>[2]>[1];

/** The payload of one pending proposal. */
interface ProposalPayload {
	readonly body?: string;
	readonly kind?: NoteKind;
	readonly scope?: ScopeKey;
	readonly review_at?: string | null;
	readonly longform?: string;
	readonly supersedes?: readonly string[];
	readonly session?: string;
}

// #region FUNC_actionRoute
/**
 * @purpose Send each action to one handler, so the route holds no edit rule.
 * @invariants A delete of one record or of one scope needs confirmation. An unknown action gives
 *   a Usage error.
 * @param request - The resolved console request with the action fields.
 */
export async function actionRoute(request: ConsoleRequest): Promise<unknown> {
	const { memory, scope, fields } = request;
	const action = text(fields, "action");
	debug("Action start", { event: "action", action, scope });
	if (action === "compact" || action === "compact-answer")
		return compactAction(request);
	if (
		(action === "delete" || action === "scope-delete") &&
		fields.confirm !== true
	)
		throw new MemlensError("NotAllowed", "Delete needs confirmation.");
	if (action === "note") return applyNote(memory, scope, fields);
	if (action === "accept" || action === "dismiss")
		return applyProposal(memory, fields, action);
	if (action === "scope-forget" || action === "scope-delete")
		return applyScopeAction(memory, scope, fields, action);
	return applyRecordAction(memory, scope, fields, action);
}
// #endregion FUNC_actionRoute

// #region FUNC_applyNote
/**
 * @purpose Save one note of the tab, so the browser writes through the store rules.
 * @invariants A duplicate gives no error, and the answer holds the duplicate flag.
 */
function applyNote(
	memory: AgentMemory,
	scope: ScopeKey,
	fields: Fields,
): unknown {
	const kind = noteKind(text(fields, "kind") || "note");
	const supersedes = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.map((target) => targetRecord(memory, scope, target).id);
	const saved = note(memory.store, {
		scope,
		body: text(fields, "body"),
		kind,
		longform: text(fields, "longform"),
		...(supersedes.length ? { supersedes } : {}),
		ts: nowIso(),
		review_at: addDaysAtTime(Date.now(), memory.config.review[kind]),
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
 * @invariants A proposal that is no longer pending gives a Data error. An accept applies its
 *   operation and closes it in one store transaction.
 */
function applyProposal(
	memory: AgentMemory,
	fields: Fields,
	action: string,
): unknown {
	const proposal = pending(memory.store).find(
		(item) => item.id === text(fields, "target"),
	);
	if (!proposal)
		throw new MemlensError("Data", "The proposal is no longer pending.");
	if (action === "dismiss") {
		dismiss(memory.store, proposal.id);
		return { ok: true };
	}
	accept(
		memory.store,
		proposal.id,
		(payload, tx) => applyAccepted(proposal, payload, tx),
		[...visibleScopeList(memory), proposal.scope],
	);
	debug("Proposal accepted", { event: "accept", op: proposal.op });
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
		...(data.supersedes?.length ? { supersedes: data.supersedes } : {}),
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
 * @purpose Hide or erase each note of one scope.
 * @invariants The action needs confirmation. A delete erases only the notes that are not deleted.
 */
function applyScopeAction(
	memory: AgentMemory,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): unknown {
	if (fields.confirm !== true)
		throw new MemlensError(
			"NotAllowed",
			"The scope action needs confirmation.",
		);
	const rows = scopeNotes(memory.store, scope).filter((row) =>
		action === "scope-delete" ? row.state !== "deleted" : row.state === "live",
	);
	for (const row of rows) {
		if (action === "scope-delete")
			redact(memory.store, row.id, "ui scope action");
		else hide(memory.store, row.id, "ui scope action");
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
/**
 * @purpose Apply one action to one record.
 * @invariants An action outside the four record actions gives a Usage error.
 */
function applyRecordAction(
	memory: AgentMemory,
	scope: ScopeKey,
	fields: Fields,
	action: string,
): unknown {
	const record = targetRecord(memory, scope, text(fields, "target"));
	switch (action) {
		case "amend":
			amendRecord(memory, record, fields);
			break;
		case "review":
			review(
				memory.store,
				record.id,
				addDaysAtTime(Date.now(), memory.config.review[record.kind]),
			);
			break;
		case "forget":
			hide(memory.store, record.id, "ui action");
			break;
		case "delete":
			redact(memory.store, record.id, "ui action");
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
 * @purpose Change the body, the longform, the kind, the scope, or the supersedes of one note.
 * @invariants The supersede targets resolve in the destination scope before the write.
 */
function amendRecord(memory: AgentMemory, record: Note, fields: Fields): void {
	const destination = text(fields, "dest") || record.scope;
	const kind = text(fields, "kind");
	const targets = text(fields, "supersedes")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	if (targets.length > 0)
		linkSupersedes(
			memory.store,
			record.id,
			targets.map(
				(target) =>
					targetRecord(memory, allowedScope(memory, destination), target).id,
			),
		);
	amend(memory.store, {
		id: record.id,
		scope: allowedScope(memory, destination),
		body: text(fields, "body"),
		longform: text(fields, "longform"),
		...(kind ? { kind: noteKind(kind) } : {}),
	});
}
// #endregion FUNC_amendRecord
