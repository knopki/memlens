/**
 * #region moduleContract
 * @purpose Verify deterministic conflict resolution and irreversible erasure across imports.
 * @scope Pure event unions, canonical hashes, and losing-copy evidence. No backend access.
 * #endregion moduleContract
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, mergeEvents } from "../src/domain/merge.js";
import { sanitizeEvent } from "../src/domain/sanitization.js";
import type { JsonlLine, NodeEvent, NoteEvent } from "../src/types/events.js";

const id = (n: number) => `00000000000000000000${String(n).padStart(6, "0")}`;
const at = (n: number) => `2026-11-10T00:00:${String(n).padStart(2, "0")}.000Z`;
const note = (n: number, body = "body"): NoteEvent => ({
	id: id(n),
	at: at(n),
	op: "note",
	scope: "project:a",
	body,
	kind: "note",
	ts: at(n),
	review_at: null,
	session: "s",
	turn: "t",
	preset: "p",
});
const node = (n: number, child: string): NodeEvent => ({
	id: id(n),
	at: at(n),
	op: "node",
	scope: "project:a",
	level: 1,
	start: 0,
	child_a: child,
	child_b: null,
	input_rev: null,
	summary: "summary",
	chars: 7,
	truncated: false,
	ts_from: at(1),
	ts_to: at(1),
});

// #region FUNC_assertUnion
/** @purpose Check union symmetry, unique identity, and repeat stability for the same histories. */
function assertUnion(
	left: readonly JsonlLine[],
	right: readonly JsonlLine[],
): void {
	const result = mergeEvents(left, right);
	expect(result.events).toEqual(mergeEvents(right, left).events);
	expect(new Set(result.events.map((event) => event.id)).size).toBe(
		result.events.length,
	);
	const repeated = mergeEvents(result.events, right);
	expect(repeated.events).toEqual(result.events);
	expect(repeated.added).toEqual([]);
	expect(repeated.replaced).toEqual([]);
}
// #endregion FUNC_assertUnion

describe("event union", () => {
	it("sorts object keys recursively without changing arrays or strings", () => {
		expect(canonicalJson({ z: ["é", { b: 2, a: 1 }], a: true })).toBe(
			'{"a":true,"z":["é",{"a":1,"b":2}]}',
		);
	});
	it("joins ids, preserves values, and reports only local changes", () => {
		const first = note(1);
		const next = note(2);
		const result = mergeEvents([first], [next, first]);
		expect(result.events).toEqual([first, next]);
		expect(result.added).toEqual([next.id]);
		expect(result.replaced).toEqual([]);
		assertUnion([first], [next, first]);
	});
	it("keeps the later timestamp for equal sanitized status", () => {
		const first = note(1);
		const next = { ...first, at: at(2), body: "later" };
		expect(mergeEvents([first], [next]).events).toEqual([next]);
		assertUnion([first], [next]);
	});
	it("uses SHA-256 rather than field or arrival order at equal time", () => {
		const a = note(1, "alpha");
		const b = note(1, "beta");
		const hash = (event: JsonlLine) =>
			createHash("sha256").update(canonicalJson(event)).digest("hex");
		const winner = hash(a) > hash(b) ? a : b;
		expect(mergeEvents([a], [b]).events).toEqual([winner]);
		expect(
			mergeEvents([a], [Object.fromEntries(Object.entries(b).reverse())])
				.events,
		).toEqual([winner]);
		assertUnion([a], [b]);
	});
	it("keeps an older sanitized copy over newer content", () => {
		const raw = { ...note(1), at: at(3) };
		const cleared = sanitizeEvent(note(1));
		expect(mergeEvents([raw], [cleared]).events).toEqual([cleared]);
		assertUnion([raw], [cleared]);
	});
	it("applies losing-copy erasure and historical child edges", () => {
		const source = note(1, "private");
		const sibling = note(2, "safe");
		const old = node(3, source.id);
		const winner = { ...old, at: at(4), child_a: sibling.id };
		const erase: JsonlLine = {
			id: id(5),
			at: at(5),
			op: "redact",
			scope: source.scope,
			target: source.id,
			reason: "erase",
		};
		const result = mergeEvents([source, sibling, old], [winner, erase]);
		expect(result.events.find((event) => event.id === old.id)).toMatchObject({
			redacted: true,
			summary: "",
			child_a: sibling.id,
		});
		expect(result.events.find((event) => event.id === sibling.id)).toEqual(
			sibling,
		);
		assertUnion([source, sibling, old], [winner, erase]);
	});
	it("rejects a malformed history container with a domain error", () => {
		expect(() => mergeEvents([], null as unknown as unknown[])).toThrow(
			expect.objectContaining({ code: "Data" }),
		);
	});
	it("rejects malformed losing copies before conflict selection", () => {
		const first = note(1);
		expect(() =>
			mergeEvents([first], [{ ...first, at: at(0), kind: "invalid" }]),
		).toThrow(expect.objectContaining({ code: "Data" }));
	});
	it("keeps unrelated summaries and never mutates frozen input", () => {
		const first = Object.freeze(note(1));
		const built = Object.freeze(node(2, first.id));
		const events = Object.freeze([first, built]);
		expect(mergeEvents(events, []).events).toEqual(events);
		expect(mergeEvents(events, []).replaced).toEqual([]);
	});
	it("keeps all invalidation evidence while selecting one event winner", () => {
		const earlier: JsonlLine = {
			id: id(4),
			at: at(4),
			op: "invalidate",
			scope: "project:a",
			targets: [id(2)],
		};
		const later = { ...earlier, at: at(5), targets: [id(3)] };
		for (const [local, incoming] of [
			[[earlier], [later]],
			[[later], [earlier]],
		]) {
			const result = mergeEvents(local, incoming);
			expect(result.events).toEqual([later]);
			expect(
				new Set(result.invalidationEvidence.flatMap((item) => item.targets)),
			).toEqual(new Set([id(2), id(3)]));
		}
	});
	it("checks known target types in losing invalidation evidence", () => {
		const source = note(1);
		const bad: JsonlLine = {
			id: id(4),
			at: at(4),
			op: "invalidate",
			scope: source.scope,
			targets: [source.id],
		};
		const later = { ...bad, at: at(5), targets: [id(3)] };
		expect(() => mergeEvents([source, bad], [later])).toThrow(
			expect.objectContaining({ code: "Data" }),
		);
	});
	it("resolves three-way conflicts associatively without erasure", () => {
		const a = note(1, "a"),
			b = note(1, "b"),
			c = { ...note(1, "c"), at: at(2) };
		expect(mergeEvents(mergeEvents([a], [b]).events, [c]).events).toEqual(
			mergeEvents([a], mergeEvents([b], [c]).events).events,
		);
	});
});
