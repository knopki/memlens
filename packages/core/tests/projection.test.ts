/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check replay convergence, sticky erasure, and scope positions against the accepted event rules.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { makeOrder } from "../src/domain/order.js";
import { catalogTree, project, scopeTree } from "../src/domain/projection.js";
import type { JsonlLine, NodeEvent, NoteEvent } from "../src/types/events.js";

const at = (n: number) => `2026-11-10T00:00:${String(n).padStart(2, "0")}.000Z`;
const base = (n: number, scope = "project:a") => ({
	id: String(n),
	at: at(n),
	scope,
});
const note = (n: number, fields: Partial<NoteEvent> = {}): NoteEvent => ({
	...base(n),
	op: "note",
	body: `body ${n}`,
	kind: "fact",
	ts: at(0),
	review_at: null,
	session: "session",
	turn: "turn",
	preset: "preset",
	...fields,
});
const node = (n: number, fields: Partial<NodeEvent> = {}): NodeEvent => ({
	...base(n),
	op: "node",
	level: 1,
	start: 0,
	child_a: "1",
	child_b: "2",
	input_rev: makeOrder(at(2), "2"),
	summary: "summary",
	chars: 7,
	truncated: false,
	ts_from: at(0),
	ts_to: at(0),
	...fields,
});

describe("two-pass projection", () => {
	it("copies note payload and retains the physical cursor", () => {
		const event = note(1, {
			longform: "document",
			refs: ["ref"],
			supersedes: [],
		});
		const p = project([event], 1024);
		expect(p.records.get("1")).toEqual({
			id: "1",
			scope: "project:a",
			pos: 0,
			order: makeOrder(at(1), "1"),
			state: "live",
			body: "body 1",
			kind: "fact",
			ts: at(0),
			review_at: null,
			recorded_at: at(1),
			longform: "document",
			refs: ["ref"],
			supersedes: [],
			superseded_by: null,
			content_cleared: false,
			session: "session",
			turn: "turn",
			preset: "preset",
		});
		expect(p.version).toBe(1);
		expect(p.cursor).toBe(1024);
	});

	it("converges for shuffled input and resolves a forward supersede", () => {
		const events: JsonlLine[] = [
			note(1, { supersedes: ["2"] }),
			note(2),
			{ ...base(3), op: "hide", target: "1", reason: "done" },
		];
		const p = project(events);
		expect(project([...events].reverse())).toEqual(p);
		expect(p.records.get("2")).toMatchObject({
			state: "hidden",
			superseded_by: "1",
			pos: 1,
		});
		expect(p.records.get("1")?.state).toBe("hidden");
	});

	it("orders equal timestamps by id", () => {
		const p = project([note(2, { at: at(1) }), note(1)]);
		expect(p.byScope.get("project:a")?.map((r) => r.id)).toEqual(["1", "2"]);
	});

	it("creates records before an earlier operation targets them", () => {
		const p = project([
			{ ...base(1), op: "hide", target: "2", reason: "earlier" },
			note(2),
		]);
		expect(p.records.get("2")?.state).toBe("hidden");
	});

	it("keeps the first superseding id and never repeats supersedes", () => {
		const p = project([
			note(1),
			note(2, { supersedes: ["1"] }),
			note(3, { supersedes: ["1"] }),
			{ ...base(4), op: "amend", target: "2", body: "edit" },
		]);
		expect(p.records.get("1")).toMatchObject({
			state: "hidden",
			superseded_by: "2",
			order: makeOrder(at(3), "3"),
		});
	});

	it("keeps supersede effects after the replacing note is redacted", () => {
		const p = project([
			note(1),
			note(2, { supersedes: ["1"] }),
			{ ...base(3), op: "redact", target: "2", reason: "erase" },
		]);
		expect(p.records.get("1")).toMatchObject({
			state: "hidden",
			superseded_by: "2",
		});
		expect(p.records.get("2")?.state).toBe("deleted");
	});

	it("rejects a cross-scope supersede", () => {
		expect(() =>
			project([note(1), note(2, { scope: "project:b", supersedes: ["1"] })]),
		).toThrow(/another scope/);
	});

	it("ignores proposals and their dismissals without allocating slots", () => {
		const p = project([
			note(1, { proposed: true, scope: "project:proposal" }),
			note(2),
			{
				...base(3),
				op: "hide",
				target: "2",
				reason: "proposal",
				proposed: true,
			},
			{
				...base(4, "project:b"),
				op: "amend",
				target: "2",
				body: "proposal",
				proposed: true,
			},
			{
				...base(5),
				op: "review",
				target: "2",
				review_at: "2027-01-01",
				proposed: true,
			},
			{ ...base(6), op: "dismiss", target: "1", reason: "no" },
		]);
		expect(p.records.size).toBe(1);
		expect(p.records.get("2")).toMatchObject({
			pos: 0,
			state: "live",
			body: "body 2",
			review_at: null,
		});
		expect(p.scopeOrder).toEqual(["project:a"]);
	});

	it("assigns fresh transfer slots and retains historical empty positions", () => {
		const p = project([
			note(1),
			note(2, { scope: "project:b" }),
			{ ...base(3, "project:b"), op: "amend", target: "1" },
			{ ...base(4), op: "amend", target: "1" },
			{ ...base(5), op: "amend", target: "1", body: "edit" },
		]);
		expect(p.records.get("1")).toMatchObject({
			scope: "project:a",
			pos: 1,
			body: "edit",
		});
		expect(p.scopeCounts.get("project:a")).toEqual({
			scope: "project:a",
			total: 2,
			live: 1,
		});
		expect(p.scopeCounts.get("project:b")).toEqual({
			scope: "project:b",
			total: 2,
			live: 1,
		});
	});

	it("preserves absent amendment fields and applies review dates", () => {
		const p = project([
			note(1, { longform: "document" }),
			{ ...base(2), op: "amend", target: "1", body: "new" },
			{ ...base(3), op: "review", target: "1", review_at: "2027-01-01" },
		]);
		const plain = project([
			note(1, { longform: "document" }),
			{ ...base(2), op: "amend", target: "1", body: "new" },
		]);
		expect(p.records.get("1")).toMatchObject({
			body: "new",
			longform: "document",
			review_at: "2027-01-01",
			pos: 0,
		});
		expect(p.records.get("1")?.order).toEqual(plain.records.get("1")?.order);
	});

	it("keeps deletion sticky across hides, content edits, and scope transfers", () => {
		const p = project([
			note(1, { longform: "secret" }),
			{ ...base(2), op: "redact", target: "1", reason: "erase" },
			{ ...base(3), op: "hide", target: "1", reason: "hidden" },
			{
				...base(4, "project:b"),
				op: "amend",
				target: "1",
				body: "restore",
				longform: "restore",
			},
		]);
		expect(p.records.get("1")).toMatchObject({
			state: "deleted",
			content_cleared: true,
			body: "",
			longform: null,
			scope: "project:b",
			pos: 0,
		});
		expect(p.scopeCounts.get("project:a")).toMatchObject({ total: 1, live: 0 });
	});

	it("takes erasure evidence from sanitized amendments without a redact event", () => {
		const p = project([
			note(1),
			{ ...base(2), op: "amend", target: "1", redacted: true },
			{ ...base(3), op: "amend", target: "1", body: "restore" },
		]);
		expect(p.records.get("1")).toMatchObject({
			state: "deleted",
			content_cleared: true,
			body: "",
			longform: null,
		});
	});

	it("selects the latest surviving node after collecting all invalidations", () => {
		const p = project([
			note(1),
			note(2),
			node(3),
			node(4),
			{ ...base(5), op: "invalidate", targets: ["4"] },
		]);
		expect(p.nodes.get("project:a")?.map((n) => n.id)).toEqual(["3"]);
		expect(p.invalidated.has("4")).toBe(true);
		expect(p.records.size).toBe(2);
	});

	it("excludes sanitized nodes even without explicit invalidation", () => {
		const p = project([
			note(1),
			note(2),
			{ ...node(3), summary: "", chars: 0, redacted: true },
		]);
		expect(p.nodes.get("project:a") ?? []).toEqual([]);
		expect(p.records.get("1")?.state).toBe("live");
	});

	it("keeps empty scopes in the catalog and filters the profile", () => {
		const p = project([
			note(1, { scope: "project:other" }),
			note(2),
			note(3, { scope: "project:b" }),
			{ ...base(4), op: "hide", target: "2", reason: "empty" },
		]);
		const catalog = catalogTree(p, "profile", ["project:b", "project:a"]);
		expect(catalog.total).toBe(2);
		expect(catalog.scope_roots?.get(0)).toEqual(scopeTree(p, "project:a"));
		expect(catalog.scope_roots?.get(1)).toEqual(scopeTree(p, "project:b"));
		expect(catalog.notes).toEqual([]);
		expect(scopeTree(p, "project:absent")).toMatchObject({
			total: 0,
			notes: [],
			nodes: [],
		});
	});

	it("does not mutate source event payloads", () => {
		const event = note(1, { refs: ["source"] });
		const before = structuredClone(event);
		project([event, { ...base(2), op: "amend", target: "1", body: "edit" }]);
		expect(event).toEqual(before);
	});
});
