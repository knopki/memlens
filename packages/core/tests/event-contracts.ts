/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check content clearing and structural retention in the event types at compile time.
 * @scope Sanitized events and the JSONL union. No runtime storage checks.
 * #endregion moduleContract
 */

import type {
	AmendEvent,
	DismissEvent,
	Event,
	HideEvent,
	InvalidateEvent,
	JsonlLine,
	NodeEvent,
	NoteEvent,
	RedactEvent,
	ReviewEvent,
	SanitizedAmendEvent,
	SanitizedNodeEvent,
	SanitizedNoteEvent,
	Ulid,
} from "../../../docs/spec/events.js";

import type { JsonlLine as CoreJsonlLine } from "../src/types/events.js";
import type { AppendEvent } from "../src/types/store.js";

// #region FUNC_assertEventContracts
/** @purpose Reject type changes that lose event structure or permit cleared content to return. */
export function assertEventContracts(): void {
	type Assert<Value extends true> = Value;
	type Equal<A, B> =
		(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
			? true
			: false;
	type Replace<T, Fields> = Omit<T, keyof Fields> & Fields;
	type Rejected<T> = T extends JsonlLine ? false : true;
	type KeysOf<T> = T extends unknown ? keyof T : never;
	type OptionalProposed<T> = "proposed" extends keyof T
		? Record<never, never> extends Pick<T, "proposed">
			? true
			: false
		: false;
	type Proposed = true | undefined;
	type NoteContent = "body" | "longform" | "redacted";
	type NodeContent = "summary" | "chars" | "redacted";
	type Checks = [
		Assert<Equal<CoreJsonlLine, JsonlLine>>,
		Assert<
			Extract<AppendEvent, { op: "note" }> extends Omit<NoteEvent, "id" | "at">
				? true
				: false
		>,
		Assert<Equal<Extract<AppendEvent, { op: "note" }>["body"], string>>,
		Assert<
			Equal<Omit<SanitizedNoteEvent, NoteContent>, Omit<NoteEvent, NoteContent>>
		>,
		Assert<
			Equal<
				Omit<SanitizedAmendEvent, NoteContent>,
				Omit<AmendEvent, NoteContent>
			>
		>,
		Assert<
			Equal<Omit<SanitizedNodeEvent, NodeContent>, Omit<NodeEvent, NodeContent>>
		>,
		Assert<Equal<SanitizedNoteEvent["body"], "">>,
		Assert<Equal<SanitizedNoteEvent["longform"], null>>,
		Assert<Equal<SanitizedAmendEvent["body"], "" | undefined>>,
		Assert<Equal<SanitizedAmendEvent["longform"], null | undefined>>,
		Assert<Equal<SanitizedNodeEvent["summary"], "">>,
		Assert<Equal<SanitizedNodeEvent["chars"], 0>>,
		Assert<Rejected<Replace<SanitizedNoteEvent, { body: "secret" }>>>,
		Assert<Rejected<Replace<SanitizedAmendEvent, { longform: "secret" }>>>,
		Assert<Rejected<Replace<SanitizedNodeEvent, { summary: "secret" }>>>,
		Assert<Rejected<Replace<SanitizedNodeEvent, { chars: 1 }>>>,
		Assert<Rejected<Omit<SanitizedNoteEvent, "op">>>,
		Assert<Rejected<Omit<SanitizedAmendEvent, "target">>>,
		Assert<Rejected<Omit<SanitizedAmendEvent, "scope">>>,
		Assert<Rejected<Omit<SanitizedNodeEvent, "child_a">>>,
		Assert<Replace<NoteEvent, { redacted: true }> extends Event ? false : true>,
		Assert<
			Extract<JsonlLine, { op: "hide"; redacted: true }> extends never
				? true
				: false
		>,
		Assert<OptionalProposed<NoteEvent>>,
		Assert<OptionalProposed<AmendEvent>>,
		Assert<OptionalProposed<HideEvent>>,
		Assert<OptionalProposed<ReviewEvent>>,
		Assert<Equal<NoteEvent["proposed"], Proposed>>,
		Assert<Equal<AmendEvent["proposed"], Proposed>>,
		Assert<Equal<HideEvent["proposed"], Proposed>>,
		Assert<Equal<ReviewEvent["proposed"], Proposed>>,
		Assert<
			Equal<
				Extract<
					KeysOf<RedactEvent | DismissEvent | NodeEvent | InvalidateEvent>,
					"proposed"
				>,
				never
			>
		>,
		Assert<Equal<Extract<KeysOf<Event>, "accepts">, never>>,
		Assert<Equal<Extract<KeysOf<DismissEvent>, "proposal">, never>>,
		Assert<Equal<DismissEvent["target"], Ulid>>,
	];
	// A scope-only amendment retains its flag and target without gaining body or longform.
	const metadataOnly: SanitizedAmendEvent = {
		id: "01J00000000000000000000005",
		at: "2026-11-09T00:00:00Z",
		scope: "project:moved",
		op: "amend",
		target: "01J00000000000000000000001",
		redacted: true,
	};
	void metadataOnly;
	void (null as unknown as Checks);
}
// #endregion FUNC_assertEventContracts
