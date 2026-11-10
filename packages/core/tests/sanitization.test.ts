/**
 * #region moduleContract
 * @modulecontract
 * @purpose Verify that erased content cannot return through historical events or imported copies.
 * @invariants Check structural preservation, absent fields, immutable inputs, and stable repeated results.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { redactionClosure, sanitizeEvent } from "../src/domain/sanitization.js";
import type {
	AmendEvent,
	JsonlLine,
	NodeEvent,
	NoteEvent,
	RedactEvent,
} from "../src/types/events.js";

const base = { at: "2026-11-10T00:00:00Z", scope: "project:a" };
const note = (id: string): NoteEvent => ({
	...base,
	id,
	op: "note",
	body: `body ${id}`,
	longform: `longform ${id}`,
	kind: "fact",
	ts: base.at,
	review_at: null,
	session: "session",
	turn: "turn",
	preset: "preset",
	refs: ["ref"],
	supersedes: ["old"],
});
const amend = (id: string, target: string): AmendEvent => ({
	...base,
	id,
	op: "amend",
	target,
	body: `body ${id}`,
	longform: `longform ${id}`,
});
const node = (
	id: string,
	child_a: string | null,
	child_b: string | null = null,
): NodeEvent => ({
	...base,
	id,
	op: "node",
	child_a,
	child_b,
	level: 1,
	start: 0,
	input_rev: "a|b",
	summary: `summary ${id}`,
	chars: 12,
	truncated: false,
	ts_from: base.at,
	ts_to: base.at,
});
const redact = (target: string): RedactEvent => ({
	...base,
	id: `redact-${target}`,
	op: "redact",
	target,
	reason: "reason",
});

// #region FUNC_expectCleared
/** @purpose Check exact sanitized forms without accepting changes to structural metadata. */
function expectCleared(events: readonly JsonlLine[], ids: readonly string[]) {
	const result = redactionClosure(events);
	for (let index = 0; index < events.length; index++) {
		const event = events[index];
		if (!event) continue;
		expect(result[index]).toEqual(
			ids.includes(event.id) ? sanitizeEvent(event) : event,
		);
	}
	return result;
}
// #endregion FUNC_expectCleared

describe("sanitizeEvent", () => {
	it("clears note content and preserves metadata and proposals", () => {
		const event = { ...note("a"), proposed: true as const };
		expect(sanitizeEvent(event)).toEqual({
			...event,
			body: "",
			longform: null,
			redacted: true,
		});
		const { longform: _longform, ...short } = event;
		expect(sanitizeEvent(short)).toEqual({
			...short,
			body: "",
			longform: null,
			redacted: true,
		});
	});

	it("clears only present amendment fields", () => {
		const event = amend("edit", "a");
		const { body: _body, longform: _longform, ...metadata } = event;
		for (const fields of [{}, { body: "text" }, { longform: "text" }, event]) {
			const input = { ...metadata, ...fields, proposed: true as const };
			const result = sanitizeEvent(input);
			expect(result).toEqual({
				...metadata,
				proposed: true,
				...(Object.hasOwn(fields, "body") ? { body: "" } : {}),
				...(Object.hasOwn(fields, "longform") ? { longform: null } : {}),
				redacted: true,
			});
		}
	});

	it("clears node content and preserves all source fields", () => {
		const event = node("n", "a", "b");
		expect(sanitizeEvent(event)).toEqual({
			...event,
			summary: "",
			chars: 0,
			redacted: true,
		});
	});

	it("leaves all other operations unchanged", () => {
		const events: JsonlLine[] = [
			redact("a"),
			{ ...base, id: "hide", op: "hide", target: "a", reason: "reason" },
			{ ...base, id: "review", op: "review", target: "a", review_at: null },
			{ ...base, id: "dismiss", op: "dismiss", target: "p", reason: "reason" },
			{ ...base, id: "invalidate", op: "invalidate", targets: ["n"] },
		];
		for (const event of events) expect(sanitizeEvent(event)).toBe(event);
	});

	it("keeps frozen inputs intact and produces idempotent values", () => {
		for (const event of [note("a"), amend("edit", "a"), node("n", "a")]) {
			const snapshot = structuredClone(event);
			Object.freeze(event);
			const result = sanitizeEvent(event);
			expect(event).toEqual(snapshot);
			expect(sanitizeEvent(result)).toEqual(result);
		}
	});
});

describe("redactionClosure", () => {
	it("clears original notes and all past, future, proposed, and scope-only amendments", () => {
		const events: JsonlLine[] = [
			amend("past", "a"),
			note("a"),
			note("b"),
			redact("a"),
			{ ...amend("future", "a"), proposed: true, scope: "project:b" },
			{ ...base, id: "move", op: "amend", target: "a", scope: "project:c" },
			amend("sibling", "b"),
		];
		expectCleared(events, ["past", "a", "future", "move"]);
	});

	it("follows historical nodes through old scopes and catalog paths without clearing sibling notes", () => {
		const events: JsonlLine[] = [
			node("catalog-old", "old", "other"),
			{ ...node("old", "a", "b"), scope: "project:old" },
			{ ...node("new", "a", "b"), scope: "project:new" },
			node("catalog-new", "new"),
			node("other", "b"),
			note("a"),
			note("b"),
			redact("a"),
		];
		expectCleared(events, ["a", "old", "new", "catalog-old", "catalog-new"]);
	});

	it("uses sanitized note and amendment copies without a redact event", () => {
		for (const evidence of [
			sanitizeEvent(note("a")),
			sanitizeEvent(amend("edit", "a")),
		]) {
			const events = [note("a"), amend("edit", "a"), node("n", "a"), note("b")];
			expect(redactionClosure(events, [evidence])).toEqual([
				sanitizeEvent(events[0] as JsonlLine),
				sanitizeEvent(events[1] as JsonlLine),
				sanitizeEvent(events[2] as JsonlLine),
				events[3],
			]);
		}
	});

	it("uses sanitized node evidence only upward", () => {
		expectCleared(
			[
				note("a"),
				note("b"),
				amend("edit", "a"),
				node("child", "a"),
				sanitizeEvent(node("mixed", "child", "b")),
				node("parent", "mixed"),
			],
			["mixed", "parent"],
		);
	});

	it("collects losing historical edges from either side before conflicts", () => {
		const left = [
			note("a"),
			note("b"),
			redact("a"),
			node("n", "a"),
			node("root", "n"),
		];
		const right = [
			note("a"),
			note("b"),
			{ ...node("n", "b"), at: "2026-11-11T00:00:00Z" },
			node("root", "n"),
		];
		for (const [events, evidence] of [
			[left, right],
			[right, left],
		] as const) {
			const result = redactionClosure(events, evidence);
			expect(result).toHaveLength(events.length);
			for (let i = 0; i < events.length; i++) {
				const event = events[i] as JsonlLine;
				expect(result[i]).toEqual(
					event.id === "b" || event.op === "redact"
						? event
						: sanitizeEvent(event),
				);
			}
		}
	});

	it("clears unresolved chains with any erasure evidence but preserves resolved siblings", () => {
		const events: JsonlLine[] = [
			note("safe"),
			node("resolved", "safe"),
			node("missing", "absent", "safe"),
			node("ancestor", "missing"),
			node("empty", null),
			node("cycle-a", "cycle-b"),
			node("cycle-b", "cycle-a", "safe"),
			node("self", "self"),
			node("above-cycle", "cycle-a"),
			{ ...base, op: "hide", id: "hidden", target: "safe", reason: "reason" },
			node("wrong-source", "hidden"),
		];
		expect(redactionClosure(events)).toBe(events);
		for (const evidence of [
			[redact("absent-record")],
			[sanitizeEvent(node("erased", "safe"))],
		]) {
			const result = redactionClosure(events, evidence);
			for (let i = 0; i < events.length; i++) {
				const event = events[i] as JsonlLine;
				expect(result[i]).toEqual(
					event.op === "node" && event.id !== "resolved"
						? sanitizeEvent(event)
						: event,
				);
			}
		}
	});

	it("resolves shared and repeated children from evidence without clearing safe summaries", () => {
		const events = [
			node("left", "safe", "safe"),
			node("right", "safe"),
			node("root", "left", "right"),
		];
		expect(redactionClosure(events, [note("safe"), redact("other")])).toEqual(
			events,
		);
	});

	it("retains unresolved evidence from an empty losing node copy", () => {
		const events = [note("safe"), node("n", "safe"), node("root", "n")];
		expect(
			redactionClosure(events, [node("n", null), redact("other")]),
		).toEqual([
			events[0],
			sanitizeEvent(events[1] as JsonlLine),
			sanitizeEvent(events[2] as JsonlLine),
		]);
	});

	it("treats a sanitized scope-only amendment as record erasure evidence", () => {
		const evidence = sanitizeEvent({
			...base,
			id: "move",
			op: "amend",
			target: "a",
		});
		const events = [note("a"), amend("later", "a"), node("n", "a")];
		expect(redactionClosure(events, [evidence])).toEqual(
			events.map(sanitizeEvent),
		);
	});

	it("does not restore an unresolved summary when later evidence completes its chain", () => {
		const events = redactionClosure([node("n", "missing")], [redact("other")]);
		expect(redactionClosure(events, [note("missing")])).toEqual(events);
	});

	it("does not mutate frozen arrays or events and remains idempotent with duplicate copies", () => {
		const events = Object.freeze(
			[
				note("a"),
				note("a"),
				amend("edit", "a"),
				node("n", "a"),
				redact("a"),
			].map(Object.freeze),
		);
		const evidence = Object.freeze([Object.freeze(node("ancestor", "n"))]);
		const before = structuredClone(events);
		const result = redactionClosure(events, evidence);
		expect(events).toEqual(before);
		expect(result.map((event) => event.id)).toEqual(
			events.map((event) => event.id),
		);
		expect(redactionClosure(result, evidence)).toEqual(result);
	});

	it("handles long chains without recursive traversal", () => {
		const events: JsonlLine[] = [note("a"), redact("a")];
		for (let i = 0; i < 12000; i++)
			events.push(node(`n${i}`, i === 0 ? "a" : `n${i - 1}`));
		const result = redactionClosure(events);
		expect(result.filter((event) => event.redacted)).toHaveLength(12001);
	});
});
