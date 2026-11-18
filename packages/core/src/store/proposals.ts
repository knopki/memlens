/**
 * #region moduleContract
 * @modulecontract
 * @purpose Let an agent propose a memory change and a human decide it with one journaled write.
 * @scope The open proposal row, the thirty-day expiry, the lazy sweep, the accepted payload, and the close.
 *        NOT: the note write of an accepted payload, rendering, or transport.
 * @invariants One publish call writes each change. A closed row keeps no payload.
 * @invariants A closed or stale id changes no row.
 * @dependencies USES API: node:sqlite
 * @keywords proposal, propose, pending, accept, dismiss, expire, sweep, scope
 * #endregion moduleContract
 */

import type { SQLOutputValue } from "node:sqlite";
import { debuglog } from "node:util";
import { ulid } from "../domain/ulid.js";
import { MemlensError } from "../types/errors.js";
import type { ScopeKey } from "../types/primitives.js";
import type { Store, Tx } from "./store.js";
import type { Proposal, ProposalStatus } from "./types.js";

const debug = debuglog("memlens:proposals");

/** The lifetime of an open proposal. */
const TTL_DAYS = 30;

/** The greatest reason length of one journal fact. */
const REASON_LIMIT = 200;

/** The message of a refused decision. One message serves each refusal. */
const NOT_PENDING = "The proposal is no longer pending or has changed.";

/** The status text of each closed value. */
const STATUS: Record<number, ProposalStatus> = {
	0: "open",
	1: "accepted",
	2: "dismissed",
	3: "expired",
};

// #region TYPE_ProposalInput
/**
 * @purpose Name the fields of one proposed change, so a caller builds it without a schema.
 * @invariants A caller gives a scope, an operation, and a payload. The id and the target are optional.
 */
export interface ProposalInput {
	/** The id of the row. The store mints a ULID when the caller gives none. */
	readonly id?: string;
	readonly scope: ScopeKey;
	readonly op: string;
	readonly target?: string;
	readonly payload: unknown;
}
// #endregion TYPE_ProposalInput

// #region FUNC_propose
/**
 * @purpose Store one pending change, so a human decides it later inside its scope.
 * @requires The scope is a scope key. The op is a proposal operation name.
 * @ensures The row is open, holds the payload as JSON text, and expires after thirty days.
 * @ensures The change appends one journal fact without payload content.
 * @returns The stored proposal.
 */
export function propose(store: Store, input: ProposalInput): Proposal {
	const id = input.id ?? ulid(Date.now());
	const created_at = new Date().toISOString();
	const expires_at = new Date(
		Date.parse(created_at) + TTL_DAYS * 86_400_000,
	).toISOString();
	const payload = JSON.stringify(input.payload) ?? "null";
	const proposal: Proposal = {
		id,
		scope: input.scope,
		op: input.op,
		target: input.target ?? null,
		payload,
		created_at,
		expires_at,
		status: "open",
	};
	store.publish((tx) => {
		tx.db
			.prepare(
				"INSERT INTO proposals (id, scope, op, target, payload, created_at, expires_at, closed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
			)
			.run(
				id,
				proposal.scope,
				proposal.op,
				proposal.target,
				payload,
				created_at,
				expires_at,
			);
		tx.journal("propose", id, proposal.scope);
	});
	debug("Proposal stored", {
		event: "propose",
		id,
		scope: proposal.scope,
		op: proposal.op,
	});
	return proposal;
}
// #endregion FUNC_propose

// #region FUNC_pending
/**
 * @purpose List each open proposal, so a screen or a command shows the pending work in age order.
 * @ensures The list holds open rows only, oldest first.
 * @returns The open proposals. The list is empty when no row is open.
 */
export function pending(store: Store): readonly Proposal[] {
	const rows = store.read((db) =>
		db
			.prepare(
				"SELECT id, scope, op, target, payload, created_at, expires_at, closed FROM proposals WHERE closed = 0 ORDER BY created_at, id",
			)
			.all(),
	);
	const proposals = rows.map(proposalFromRow);
	debug("Pending proposals", { event: "pending", count: proposals.length });
	return proposals;
}
// #endregion FUNC_pending

// #region FUNC_sweep
/**
 * @purpose Close each proposal past its expiry, so no timer is necessary.
 * @invariants The sweep clears the payload and keeps the row as a fact.
 * @invariants A repeated sweep closes nothing.
 * @ensures One journal fact records the count. It holds no payload content.
 * @returns The count of closed rows.
 */
export function sweep(store: Store): number {
	const closed = store.publish((tx) => {
		const now = new Date().toISOString();
		const result = tx.db
			.prepare(
				"UPDATE proposals SET closed = 3, payload = '' WHERE closed = 0 AND expires_at <= ?",
			)
			.run(now);
		const count = Number(result.changes);
		if (count > 0) {
			const reason =
				count === 1 ? "1 expired proposal" : `${count} expired proposals`;
			tx.journal("expire", null, null, reason);
		}
		debug("Sweep", { event: "sweep", closed: count });
		return count;
	}).value;
	return closed;
}
// #endregion FUNC_sweep

// #region FUNC_accept
/**
 * @purpose Apply one accepted proposal and close it in one transaction, so the change commits or nothing does.
 * @requires The row is open, it is not past its expiry, and its scope is visible.
 * @invariants The apply call runs inside the transaction of the close. A thrown error rolls back both.
 * @invariants A refused row changes no row and appends no journal fact.
 * @ensures The row is closed as accepted and holds no payload.
 * @param store - The store that holds the proposal.
 * @param id - The proposal id.
 * @param apply - The caller work that writes the payload. It shares the transaction of the store.
 * @param visibleScopes - The scopes of the current profile.
 */
export function accept(
	store: Store,
	id: string,
	apply: (payload: unknown, tx: Tx) => void,
	visibleScopes: readonly ScopeKey[],
): void {
	store.publish((tx) => {
		const row = tx.db
			.prepare(
				"SELECT id, scope, op, target, payload, created_at, expires_at, closed FROM proposals WHERE id = ?",
			)
			.get(id);
		const proposal = row === undefined ? null : proposalFromRow(row);
		const now = new Date().toISOString();
		if (
			proposal === null ||
			proposal.status !== "open" ||
			proposal.expires_at <= now ||
			!visibleScopes.includes(proposal.scope)
		) {
			debug("Proposal refused", { event: "accept_refused", id });
			throw new MemlensError("NotAllowed", NOT_PENDING);
		}
		apply(JSON.parse(proposal.payload) as unknown, tx);
		tx.db
			.prepare("UPDATE proposals SET closed = 1, payload = '' WHERE id = ?")
			.run(id);
		tx.journal("accept", id, proposal.scope);
		debug("Proposal accepted", {
			event: "accept",
			id,
			scope: proposal.scope,
			op: proposal.op,
		});
	});
}
// #endregion FUNC_accept

// #region FUNC_dismiss
/**
 * @purpose Close one proposal without a change, so the pending list stays honest.
 * @requires The row is open.
 * @invariants The row is closed as dismissed and holds no payload.
 * @ensures The reason is kept in the journal fact and cut to the journal limit.
 * @param store - The store that holds the proposal.
 * @param id - The proposal id.
 * @param reason - The operator text of the decision. It holds no payload content.
 */
export function dismiss(store: Store, id: string, reason?: string): void {
	store.publish((tx) => {
		const row = tx.db
			.prepare(
				"SELECT id, scope, op, target, payload, created_at, expires_at, closed FROM proposals WHERE id = ?",
			)
			.get(id);
		const proposal = row === undefined ? null : proposalFromRow(row);
		if (proposal === null || proposal.status !== "open") {
			debug("Proposal refused", { event: "dismiss_refused", id });
			throw new MemlensError("NotAllowed", NOT_PENDING);
		}
		const text =
			reason === undefined ? undefined : reason.slice(0, REASON_LIMIT);
		tx.db
			.prepare("UPDATE proposals SET closed = 2, payload = '' WHERE id = ?")
			.run(id);
		tx.journal("dismiss", id, proposal.scope, text);
		debug("Proposal dismissed", {
			event: "dismiss",
			id,
			scope: proposal.scope,
			reasonChars: text?.length ?? 0,
		});
	});
}
// #endregion FUNC_dismiss

/**
 * @purpose Read one stored proposal row into its public shape.
 * @invariants The closed value maps to its status name.
 */
function proposalFromRow(row: Record<string, SQLOutputValue>): Proposal {
	const status = STATUS[Number(row.closed ?? 0)];
	if (status === undefined)
		throw new MemlensError("Data", "The proposal row has an unknown status.");
	return {
		id: String(row.id),
		scope: String(row.scope) as ScopeKey,
		op: String(row.op),
		target: row.target === null ? null : String(row.target),
		payload: String(row.payload),
		created_at: String(row.created_at),
		expires_at: String(row.expires_at),
		status,
	};
}
