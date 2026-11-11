/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check strict event validation, local append normalization, and target checks.
 * @invariants Cover all eight operations, exact sanitized forms, time and node limits, and missing targets.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import {
	normalizeAppend,
	validateEvent,
	validateTargets,
} from "../src/domain/validation.js";
import { MemlensError } from "../src/types/errors.js";
import type { JsonlLine } from "../src/types/events.js";

const ID = "01J00000000000000000000001";
const ID2 = "01J00000000000000000000002";
const ID3 = "01J00000000000000000000003";
const AT = "2026-11-10T00:00:00.000Z";
const SCOPE = "project:memlens";
const eventId = (n: number): string => `01J${String(n).padStart(23, "0")}`;

const note = (id = ID, extra: Record<string, unknown> = {}): JsonlLine =>
	({
		id,
		at: AT,
		scope: SCOPE,
		op: "note",
		body: "The note.",
		kind: "fact",
		ts: AT,
		review_at: null,
		session: "session",
		turn: "turn",
		preset: "preset",
		...extra,
	}) as JsonlLine;

const node = (id = ID3, extra: Record<string, unknown> = {}): JsonlLine =>
	({
		id,
		at: AT,
		scope: SCOPE,
		op: "node",
		level: 1,
		start: 0,
		child_a: ID,
		child_b: ID2,
		input_rev: null,
		summary: "summary",
		chars: 7,
		truncated: false,
		ts_from: AT,
		ts_to: AT,
		...extra,
	}) as JsonlLine;

function expectDataError(value: unknown): void {
	try {
		validateEvent(value);
		expect.unreachable("Expected validation to fail.");
	} catch (error) {
		expect(error).toBeInstanceOf(MemlensError);
		expect((error as MemlensError).code).toBe("Data");
	}
}

describe("validateEvent", () => {
	it("validates all raw operations", () => {
		const operations: JsonlLine[] = [
			note(ID, {
				longform: "Long document.",
				refs: ["source"],
				supersedes: [ID2],
			}),
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "amend",
				target: ID,
				body: "Changed.",
				longform: "Changed document.",
			},
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "hide",
				target: ID,
				reason: "obsolete",
			},
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "redact",
				target: ID,
				reason: "private",
			},
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "review",
				target: ID,
				review_at: "2027-01-01",
			},
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "dismiss",
				target: ID3,
				reason: "rejected",
			},
			node(ID3),
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "invalidate",
				targets: [ID3],
			},
		];
		for (const event of operations) {
			expect(validateEvent(event)).toEqual(event);
		}
	});

	it("returns a copied object and copied arrays", () => {
		const input = note(ID, {
			refs: ["one"],
			supersedes: [ID2],
		}) as JsonlLine & {
			refs: string[];
			supersedes: string[];
		};
		const result = validateEvent(input) as JsonlLine & {
			refs: string[];
			supersedes: string[];
		};
		expect(result).not.toBe(input);
		expect(result.refs).not.toBe(input.refs);
		expect(result.supersedes).not.toBe(input.supersedes);
		input.refs.push("two");
		expect(result.refs).toEqual(["one"]);
	});

	it("rejects unknown fields, idem, and false or undefined proposed", () => {
		expectDataError({ ...note(), idem: "retry" });
		expectDataError({ ...note(), proposed: false });
		expectDataError({ ...note(), proposed: undefined });
		expectDataError({ ...note(), extra: undefined });
		expectDataError(null);
		expectDataError([]);
		expectDataError({ ...note(), op: "unknown" });
	});

	it("validates UTC calendar times and review dates", () => {
		for (const at of [
			"2026-11-10T00:00:00.000Z",
			"2026-11-10T00:00:00.123Z",
			"2024-02-29T23:59:59.999Z",
		]) {
			expect(validateEvent(note(ID, { at, ts: at }))).toBeTruthy();
		}
		for (const at of [
			"2026-11-10T00:00:00Z",
			"2026-11-10T00:00:00.1Z",
			"2026-11-10T00:00:00.12Z",
			"2026-11-10T00:00:00.1234Z",
			"2026-11-10T00:00:00+00:00",
			"2023-02-29T00:00:00.000Z",
			"2026-02-30T00:00:00.000Z",
			"2026-13-01T00:00:00.000Z",
			"2026-11-10T24:00:00.000Z",
		]) {
			expectDataError(note(ID, { at, ts: at }));
		}
		for (const review of [
			"2024-02-29",
			"2026-12-31",
			"2027-01-01T10:00:00.000Z",
			null,
		]) {
			expect(validateEvent(note(ID, { review_at: review }))).toBeTruthy();
		}
		for (const review of [
			"2023-02-29",
			"2026-02-30",
			"2026-1-01",
			"2026-12-31T25:00:00.000Z",
		]) {
			expectDataError(note(ID, { review_at: review }));
		}
	});

	it("rejects malformed ULIDs", () => {
		expectDataError({ ...note(), id: `8${ID.slice(1)}` });
		expectDataError({ ...note(), id: ID.slice(0, -1) });
		expectDataError({ ...note(), id: `${ID.slice(0, -1)}a` });
	});

	it("rejects unclean or oversized content on import", () => {
		expectDataError(note(ID, { body: "   " }));
		expectDataError(note(ID, { body: "x".repeat(513) }));
		expectDataError(note(ID, { longform: "x".repeat(16_385) }));
		expectDataError({ ...note(), refs: ["ok", 1] });
		expectDataError({ ...note(), supersedes: ["bad"] });
		expectDataError({ ...note(), reason: 1 });
	});

	it("accepts only the exact sanitized forms", () => {
		expect(
			validateEvent({
				...note(),
				body: "",
				longform: null,
				redacted: true,
			}),
		).toBeTruthy();
		expect(
			validateEvent({
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "amend",
				target: ID,
				body: "",
				redacted: true,
			}),
		).toBeTruthy();
		expect(
			validateEvent({
				...node(ID3),
				summary: "",
				chars: 0,
				redacted: true,
			}),
		).toBeTruthy();

		expectDataError({
			...note(),
			body: "secret",
			longform: null,
			redacted: true,
		});
		expectDataError({
			id: ID2,
			at: AT,
			scope: SCOPE,
			op: "amend",
			target: ID,
			body: "secret",
			redacted: true,
		});
		expectDataError({
			...node(ID3),
			summary: "secret",
			chars: 7,
			redacted: true,
		});
		expectDataError({
			id: ID2,
			at: AT,
			scope: SCOPE,
			op: "hide",
			target: ID,
			reason: "x",
			redacted: true,
		});
		expectDataError({ ...note(), body: "", redacted: true });
	});

	it("validates node geometry, summary, dates, and input revision", () => {
		expect(
			validateEvent(node(ID3, { child_a: null, child_b: null })),
		).toBeTruthy();
		expect(validateEvent(node(ID3, { input_rev: `${AT}|${ID}` }))).toBeTruthy();
		expectDataError(node(ID3, { level: 0 }));
		expectDataError(node(ID3, { level: 1.5 }));
		expectDataError(node(ID3, { start: 1 }));
		expectDataError(node(ID3, { start: -1 }));
		expectDataError(node(ID3, { level: 60, start: 0 }));
		expectDataError(node(ID3, { chars: 6 }));
		expectDataError(node(ID3, { summary: "x".repeat(641), chars: 641 }));
		expectDataError(node(ID3, { ts_from: "2026-11-11T00:00:00.000Z" }));
		expectDataError(node(ID3, { input_rev: "not-an-order" }));
		expectDataError(node(ID3, { child_a: `8${ID.slice(1)}` }));
	});

	it("allows catalog scope only for node and invalidate", () => {
		const catalog = "__catalog__:profile";
		expect(validateEvent(node(ID3, { scope: catalog }))).toBeTruthy();
		expect(
			validateEvent({
				id: ID2,
				at: AT,
				scope: catalog,
				op: "invalidate",
				targets: [ID3],
			}),
		).toBeTruthy();
		expectDataError(note(ID, { scope: catalog }));
		expectDataError({ ...note(), scope: "__cat__:profile" });
	});

	it("rejects invalid invalidate target lists", () => {
		expectDataError({
			id: ID2,
			at: AT,
			scope: SCOPE,
			op: "invalidate",
			targets: [],
		});
		expectDataError({
			id: ID2,
			at: AT,
			scope: SCOPE,
			op: "invalidate",
			targets: [ID3, ID3],
		});
		expectDataError({
			id: ID2,
			at: AT,
			scope: SCOPE,
			op: "invalidate",
			targets: ["bad"],
		});
	});
});

describe("normalizeAppend", () => {
	it("lowercases scope and normalizes note body", () => {
		const result = normalizeAppend({
			scope: "Project:Memlens",
			op: "note",
			body: "  one   two  ",
			kind: "note",
			ts: AT,
			review_at: null,
			session: "s",
			turn: "t",
			preset: "p",
		});
		expect(result.scope).toBe("project:memlens");
		expect(result.op).toBe("note");
		if (result.op === "note") expect(result.body).toBe("one two");
	});

	it("moves body overflow into longform", () => {
		const body = `${"word ".repeat(120)}tail`;
		const result = normalizeAppend({
			scope: SCOPE,
			op: "note",
			body,
			kind: "note",
			ts: AT,
			review_at: null,
			session: "s",
			turn: "t",
			preset: "p",
		});
		if (result.op !== "note") throw new Error("Expected note.");
		expect(result.body.length).toBeLessThanOrEqual(512);
		expect(result.longform).toContain("tail");
	});

	it("keeps absent amendment fields absent and accepts a scope-only amendment", () => {
		const result = normalizeAppend({
			scope: "Project:Memlens",
			op: "amend",
			target: ID,
		});
		expect(result).toEqual({
			op: "amend",
			scope: "project:memlens",
			target: ID,
		});
		expect("body" in result).toBe(false);
		expect("longform" in result).toBe(false);
	});

	it("normalizes only present amendment content fields", () => {
		const result = normalizeAppend({
			scope: SCOPE,
			op: "amend",
			target: ID,
			body: "  new   body  ",
		});
		expect(result).toEqual({
			op: "amend",
			scope: SCOPE,
			target: ID,
			body: "new body",
		});
	});

	it("rejects envelope fields, unknown fields, and overflow above the longform limit", () => {
		expect(() =>
			normalizeAppend({ ...note(), id: ID, at: AT, body: "ok" }),
		).toThrow(MemlensError);
		expect(() =>
			normalizeAppend({
				scope: SCOPE,
				op: "note",
				body: "body",
				kind: "note",
				ts: AT,
				review_at: null,
				session: "s",
				turn: "t",
				preset: "p",
				idem: "retry",
			}),
		).toThrow(MemlensError);
		expect(() =>
			normalizeAppend({
				scope: SCOPE,
				op: "note",
				body: "x".repeat(513),
				longform: "x".repeat(16_384),
				kind: "note",
				ts: AT,
				review_at: null,
				session: "s",
				turn: "t",
				preset: "p",
			}),
		).toThrow(MemlensError);
		expect(() =>
			normalizeAppend({
				scope: SCOPE,
				op: "note",
				body: "body",
				kind: "note",
				ts: AT,
				review_at: null,
				session: "s",
				turn: "t",
				preset: "p",
				proposed: false,
			}),
		).toThrow(MemlensError);
	});
});

describe("validateTargets", () => {
	it("accepts the permitted target types", () => {
		const source = eventId(1);
		const proposal = eventId(2);
		const nodeId = eventId(3);
		const events: JsonlLine[] = [
			note(source),
			note(proposal, { proposed: true }),
			{
				id: eventId(4),
				at: AT,
				scope: SCOPE,
				op: "amend",
				target: source,
				body: "Changed.",
			},
			{
				id: eventId(5),
				at: AT,
				scope: SCOPE,
				op: "hide",
				target: source,
				reason: "obsolete",
			},
			{
				id: eventId(6),
				at: AT,
				scope: SCOPE,
				op: "review",
				target: source,
				review_at: null,
			},
			{
				id: eventId(7),
				at: AT,
				scope: SCOPE,
				op: "redact",
				target: source,
				reason: "private",
			},
			{
				id: eventId(8),
				at: AT,
				scope: SCOPE,
				op: "dismiss",
				target: proposal,
				reason: "rejected",
			},
			node(nodeId, { child_a: source, child_b: null }),
			{
				id: eventId(9),
				at: AT,
				scope: SCOPE,
				op: "invalidate",
				targets: [nodeId],
			},
			note(eventId(10), { supersedes: [source] }),
		];
		expect(() => validateTargets(events)).not.toThrow();
	});

	it("rejects absent local targets and permits absent import targets", () => {
		const events: JsonlLine[] = [
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "hide",
				target: ID,
				reason: "obsolete",
			},
		];
		expect(() => validateTargets(events)).toThrow(MemlensError);
		expect(() => validateTargets(events, true)).not.toThrow();
	});

	it("rejects known targets of the wrong operation", () => {
		const amendments: JsonlLine[] = [
			note(ID),
			{
				id: ID2,
				at: AT,
				scope: SCOPE,
				op: "amend",
				target: ID,
				body: "Changed.",
			},
		];
		expect(() =>
			validateTargets([
				...amendments,
				{
					id: ID3,
					at: AT,
					scope: SCOPE,
					op: "hide",
					target: ID2,
					reason: "obsolete",
				},
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				note(ID),
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "dismiss",
					target: ID,
					reason: "rejected",
				},
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				note(ID),
				node(ID3, { child_a: ID, child_b: null }),
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "invalidate",
					targets: [ID],
				},
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "hide",
					target: ID,
					reason: "obsolete",
				},
				node(ID3, { child_a: ID2, child_b: null }),
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				note(ID),
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "hide",
					target: ID,
					reason: "obsolete",
				},
				note(ID3, { supersedes: [ID2] }),
			]),
		).toThrow(MemlensError);
	});

	it("rejects proposed sources, wrong dismiss sources, and node self edges", () => {
		expect(() =>
			validateTargets([
				note(ID, { proposed: true }),
				node(ID3, { child_a: ID, child_b: null }),
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				note(ID, { proposed: true }),
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "hide",
					target: ID,
					reason: "obsolete",
				},
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([
				note(ID),
				{
					id: ID2,
					at: AT,
					scope: SCOPE,
					op: "dismiss",
					target: ID,
					reason: "rejected",
				},
			]),
		).toThrow(MemlensError);
		expect(() =>
			validateTargets([node(ID3, { child_a: ID3, child_b: null })], true),
		).toThrow(MemlensError);
	});

	it("accepts node children that name notes or nodes and no collection cap", () => {
		const source = eventId(1);
		const firstNode = eventId(2);
		const nodes: JsonlLine[] = [
			note(source),
			node(firstNode, { child_a: source, child_b: null }),
		];
		for (let index = 0; index < 200; index++) {
			nodes.push(
				node(eventId(100 + index), {
					child_a: index % 2 ? source : firstNode,
					child_b: null,
				}),
			);
		}
		expect(() => validateTargets(nodes)).not.toThrow();
	});
});
