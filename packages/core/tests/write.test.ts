/**
 * #region moduleContract
 * @purpose Verify the complete path from untrusted writes to projected state and invalidation targets.
 * @scope Pure append and import plans. No file access or backend publication.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { project } from "../src/domain/projection.js";
import {
	expiredProposals,
	prepareAppend,
	prepareImport,
} from "../src/domain/write.js";
import { appendPlan, importPlan } from "../src/storage/publication.js";
import type { JsonlLine, NodeEvent, NoteEvent } from "../src/types/events.js";
import type { AppendEvent } from "../src/types/store.js";

const id = (n: number) => `00000000000000000000${String(n).padStart(6, "0")}`;
const at = (n: number) => `2026-11-10T00:00:${String(n).padStart(2, "0")}.000Z`;
const envelope = (n: number) => ({ id: id(n), at: at(n) });
const payload = (body = "body"): Extract<AppendEvent, { op: "note" }> => ({
	op: "note",
	scope: "project:a",
	body,
	kind: "note",
	ts: at(1),
	review_at: null,
	session: "s",
	turn: "t",
	preset: "p",
});
const note = (n: number, body = "body"): NoteEvent => ({
	...payload(body),
	...envelope(n),
});
const node = (n: number, source: NoteEvent): NodeEvent => ({
	...envelope(n),
	op: "node",
	scope: source.scope,
	level: 1,
	start: 0,
	child_a: source.id,
	child_b: null,
	input_rev: `${source.at}|${source.id}`,
	summary: "summary",
	chars: 7,
	truncated: false,
	ts_from: source.ts,
	ts_to: source.ts,
});

describe("local write plans", () => {
	it("normalizes and splits before the record enters the tree", () => {
		const plan = prepareAppend(
			[],
			{
				...payload(`  ${"a".repeat(510)}   tail `),
				scope: "Project:A",
				longform: "document",
			},
			envelope(1),
		);
		expect(plan.events[0]).toMatchObject({
			body: "a".repeat(510),
			longform: "tail\ndocument",
			scope: "project:a",
		});
		expect(plan.projection.records.get(id(1))?.pos).toBe(0);
		expect(plan.changed).toBe(1);
	});
	it("deduplicates normalized live payloads without allocating a position", () => {
		const original = note(1);
		const plan = prepareAppend(
			[original],
			{ ...payload("  body  "), scope: "Project:A", session: "another" },
			envelope(2),
		);
		expect(plan.duplicate).toEqual(original);
		expect(plan.changed).toBe(0);
		expect(plan.events).toEqual([original]);
		expect(plan.projection.scopeCounts.get(original.scope)?.total).toBe(1);
		expect(plan.invalidations).toEqual([]);
	});
	it.each([
		{ body: "another" },
		{ longform: "document" },
		{ kind: "fact" },
		{ review_at: "2026-12-10" },
		{ scope: "project:b" },
		{ supersedes: [] },
		{ proposed: true },
	])(
		"creates a distinct note for a changed comparison field or explicit operation: %j",
		(change) => {
			expect(
				prepareAppend([note(1)], { ...payload(), ...change }, envelope(2))
					.changed,
			).toBe(1);
		},
	);
	it("does not deduplicate a hidden note or a pending proposal", () => {
		const source = note(1);
		const hide: JsonlLine = {
			...envelope(2),
			op: "hide",
			scope: source.scope,
			target: source.id,
			reason: "hide",
		};
		expect(prepareAppend([source, hide], payload(), envelope(3)).changed).toBe(
			1,
		);
		expect(
			prepareAppend([{ ...source, proposed: true }], payload(), envelope(3))
				.changed,
		).toBe(1);
	});
	it("compares the current amended record, while returning the original identity", () => {
		const source = note(1);
		const amend: JsonlLine = {
			...envelope(2),
			op: "amend",
			scope: source.scope,
			target: source.id,
			body: "amended",
		};
		const plan = prepareAppend(
			[source, amend],
			payload("amended"),
			envelope(3),
		);
		expect(plan.duplicate?.id).toBe(source.id);
		expect(plan.projection.records.get(source.id)?.body).toBe("amended");
	});
	it("preserves an existing document when an amended body overflows", () => {
		const source = { ...note(1), longform: "original document" };
		const plan = prepareAppend(
			[source],
			{
				op: "amend",
				scope: source.scope,
				target: source.id,
				body: `${"a".repeat(510)} tail`,
			},
			envelope(2),
		);
		expect(plan.projection.records.get(source.id)?.longform).toBe(
			"tail\noriginal document",
		);
	});
	it("requires a real local target and a real scope-only amendment", () => {
		const source = note(1);
		expect(() =>
			prepareAppend(
				[source],
				{ op: "hide", scope: source.scope, target: id(9), reason: "hide" },
				envelope(2),
			),
		).toThrow(expect.objectContaining({ code: "Data" }));
		expect(() =>
			prepareAppend(
				[source],
				{ op: "amend", scope: source.scope, target: source.id },
				envelope(2),
			),
		).toThrow(expect.objectContaining({ code: "Data" }));
		const move = prepareAppend(
			[source],
			{ op: "amend", scope: "project:b", target: source.id },
			envelope(2),
		);
		expect(move.projection.records.get(source.id)).toMatchObject({
			scope: "project:b",
			pos: 0,
		});
	});
	it("rejects cross-scope supersedes without mutating the source", () => {
		const source = Object.freeze(note(1));
		expect(() =>
			prepareAppend(
				[source],
				{ ...payload(), scope: "project:b", supersedes: [source.id] },
				envelope(2),
			),
		).toThrow(expect.objectContaining({ code: "CrossScopeSupersede" }));
		expect(source.body).toBe("body");
	});
	it("checks the current scope after a transfer rather than the note source scope", () => {
		const source = note(1);
		const transfer: JsonlLine = {
			...envelope(2),
			op: "amend",
			scope: "project:b",
			target: source.id,
		};
		expect(() =>
			prepareAppend(
				[source, transfer],
				{ op: "hide", scope: source.scope, target: source.id, reason: "hide" },
				envelope(3),
			),
		).toThrow(expect.objectContaining({ code: "Data" }));
		expect(
			prepareAppend(
				[source, transfer],
				{ op: "hide", scope: "project:b", target: source.id, reason: "hide" },
				envelope(3),
			).projection.records.get(source.id)?.state,
		).toBe("hidden");
	});
	it("rejects duplicate ids and the removed idem field", () => {
		expect(() => prepareAppend([note(1)], payload(), envelope(1))).toThrow(
			expect.objectContaining({ code: "Data" }),
		);
		expect(() =>
			prepareAppend([], { ...payload(), idem: "call" }, envelope(1)),
		).toThrow(expect.objectContaining({ code: "Data" }));
	});
	it("clears the entire redaction history in a single plan", () => {
		const source = note(1, "private");
		const summary = node(2, source);
		const plan = prepareAppend(
			[source, summary],
			{ op: "redact", scope: source.scope, target: source.id, reason: "erase" },
			envelope(3),
		);
		expect(plan.events.find((event) => event.id === source.id)).toMatchObject({
			redacted: true,
			body: "",
		});
		expect(plan.events.find((event) => event.id === summary.id)).toMatchObject({
			redacted: true,
			summary: "",
		});
		expect(JSON.stringify(plan.events)).not.toContain("private");
		expect(plan.projection.records.get(source.id)?.content_cleared).toBe(true);
		expect(plan.projection.invalidated.has(summary.id)).toBe(true);
	});
});

describe("amendment fields", () => {
	const amend = (target: string, extra: Record<string, unknown>) => ({
		op: "amend" as const,
		scope: "project:a" as const,
		target,
		...extra,
	});

	it("changes the kind without a content field", () => {
		const source = note(1, "first");
		const plan = prepareAppend(
			[source],
			{ op: "amend", scope: "project:a", target: source.id, kind: "decision" },
			envelope(2),
		);
		const record = plan.projection.records.get(source.id);
		expect(record?.kind).toBe("decision");
		expect(record?.ts).toBe(source.ts);
		expect(record?.review_at).toBe(source.review_at);
		expect(record?.body).toBe("first");
	});

	it("adds supersedes links and hides each target", () => {
		const first = note(1, "first");
		const second = note(2, "second");
		const third = note(3, "third");
		const linked = prepareAppend(
			[first, second, third],
			amend(second.id, { supersedes: [first.id] }),
			envelope(4),
		);
		expect(linked.projection.records.get(second.id)?.supersedes).toEqual([
			first.id,
		]);
		expect(linked.projection.records.get(first.id)?.state).toBe("hidden");
		expect(linked.projection.records.get(first.id)?.superseded_by).toBe(
			second.id,
		);
		const again = prepareAppend(
			linked.events,
			amend(second.id, { supersedes: [third.id] }),
			envelope(5),
		);
		expect(again.projection.records.get(second.id)?.supersedes).toEqual([
			first.id,
			third.id,
		]);
		expect(again.projection.records.get(third.id)?.state).toBe("hidden");
	});

	it("rejects a cross-scope link, an absent link, and a self link", () => {
		const first = note(1, "first");
		const second = note(2, "second");
		const events = [
			first,
			second,
			{ ...note(3, "other"), scope: "project:b" as const },
		];
		expect(() =>
			prepareAppend(
				events,
				amend(second.id, { supersedes: [id(3)] }),
				envelope(4),
			),
		).toThrow(/another scope/);
		expect(() =>
			prepareAppend(
				events,
				amend(second.id, { supersedes: [id(9)] }),
				envelope(5),
			),
		).toThrow(/does not exist/);
		expect(() =>
			prepareAppend(
				events,
				amend(second.id, { supersedes: [second.id] }),
				envelope(6),
			),
		).toThrow(/supersedes/);
	});
});

describe("erased records", () => {
	it("returns a sanitized appended amendment when its source already lost content", () => {
		const source = note(1, "private");
		const erased = prepareAppend(
			[source],
			{ op: "redact", scope: source.scope, target: source.id, reason: "erase" },
			envelope(2),
		);
		const amended = prepareAppend(
			erased.events,
			{
				op: "amend",
				scope: source.scope,
				target: source.id,
				body: "must not return",
			},
			envelope(3),
		);
		expect(amended.appended).toMatchObject({ redacted: true, body: "" });
		expect(JSON.stringify(amended.events)).not.toContain("must not return");
	});
});

describe("import plans", () => {
	it("makes imported summaries unusable without invalidating the existing sibling", () => {
		const source = note(1);
		const summary = node(2, source);
		const plan = prepareImport([source], [summary]);
		expect(plan.invalidations).toEqual([
			{ scope: source.scope, targets: [summary.id] },
		]);
		expect(plan.projection.invalidated.has(summary.id)).toBe(true);
		expect(plan.projection.nodes.get(source.scope) ?? []).toEqual([]);
	});
	it("retains an existing local summary when a new imported candidate starts unusable", () => {
		const source = note(1);
		const original = node(2, source);
		const incoming = node(3, source);
		const plan = prepareImport([source, original], [incoming]);
		expect(plan.invalidations).toEqual([
			{ scope: source.scope, targets: [incoming.id] },
		]);
		expect(
			plan.projection.nodes.get(source.scope)?.map((node) => node.id),
		).toEqual([original.id]);
	});
	it("preserves catalog summaries when an unusable imported root leaves the local root unchanged", () => {
		const source = note(1);
		const original = node(2, source);
		const catalog: NodeEvent = {
			...node(3, source),
			scope: "__catalog__:work",
			child_a: original.id,
		};
		const incoming = node(4, source);
		const plan = prepareImport(
			[source, original, catalog],
			[incoming],
			new Map([["work", [source.scope]]]),
		);
		expect(plan.invalidations).toEqual([
			{ scope: source.scope, targets: [incoming.id] },
		]);
		expect(
			plan.projection.nodes.get(catalog.scope)?.map((node) => node.id),
		).toEqual([catalog.id]);
	});
	it("persists the plan through ordinary invalidation events and repeats without change", () => {
		const source = note(1);
		const summary = node(2, source);
		const local = [source, summary];
		const amend: JsonlLine = {
			...envelope(3),
			op: "amend",
			scope: source.scope,
			target: source.id,
			body: "new",
		};
		const plan = prepareImport(local, [amend]);
		expect(plan.invalidations).toEqual([
			{ scope: source.scope, targets: [summary.id] },
		]);
		const durable: JsonlLine[] = [
			...plan.events,
			...plan.invalidations.map(
				(item, n): JsonlLine => ({
					...item,
					...envelope(4 + n),
					op: "invalidate",
				}),
			),
		];
		expect(project(durable).invalidated).toEqual(plan.projection.invalidated);
		expect(project(durable).nodes.get(source.scope) ?? []).toEqual([]);
		const repeated = prepareImport(durable, [amend]);
		expect(repeated.changed).toBe(0);
		expect(repeated.invalidations).toEqual([]);
		expect(repeated.ranges).toEqual([]);
	});
	it("permits incomplete imported history while rejecting new local missing targets", () => {
		const hide: JsonlLine = {
			...envelope(2),
			op: "hide",
			scope: "project:a",
			target: id(1),
			reason: "hide",
		};
		const imported = prepareImport([], [hide]);
		expect(imported.changed).toBe(1);
		expect(prepareAppend(imported.events, payload(), envelope(3)).changed).toBe(
			1,
		);
	});
	it.each(["local", "incoming", "hash"] as const)(
		"retains invalidation evidence from the losing %s copy through replay and repeat import",
		(side) => {
			const source = note(1);
			const old = node(2, source);
			const newer = node(3, source);
			const earlier: JsonlLine = {
				...envelope(4),
				op: "invalidate",
				scope: source.scope,
				targets: [old.id],
			};
			const later = {
				...earlier,
				at: side === "hash" ? earlier.at : envelope(5).at,
				targets: [newer.id],
			};
			const local = [source, old, newer, side === "incoming" ? later : earlier];
			const incoming = [side === "incoming" ? earlier : later];
			const plan = prepareImport(local, incoming);
			expect(plan.projection.invalidated).toEqual(new Set([old.id, newer.id]));
			expect(plan.projection.nodes.get(source.scope) ?? []).toEqual([]);
			expect(plan.invalidations.flatMap((item) => item.targets)).toHaveLength(
				1,
			);
			const durable: JsonlLine[] = [
				...plan.events,
				...plan.invalidations.map(
					(item): JsonlLine => ({ ...item, ...envelope(6), op: "invalidate" }),
				),
			];
			expect(project(durable).invalidated).toEqual(plan.projection.invalidated);
			expect(project(durable).nodes.get(source.scope) ?? []).toEqual([]);
			const repeated = prepareImport(durable, incoming);
			expect(repeated.changed).toBe(0);
			expect(repeated.invalidations).toEqual([]);
		},
	);
	it("retains losing invalidation evidence when neither node is present yet", () => {
		const source = note(1);
		const earlier: JsonlLine = {
			...envelope(4),
			op: "invalidate",
			scope: source.scope,
			targets: [id(9)],
		};
		const later = { ...earlier, at: envelope(5).at, targets: [id(10)] };
		const plan = prepareImport([source, earlier], [later]);
		expect(plan.invalidations).toEqual([
			{ scope: source.scope, targets: [id(9)] },
		]);
		const durable: JsonlLine[] = [
			...plan.events,
			{
				...envelope(6),
				op: "invalidate",
				scope: source.scope,
				targets: [id(9)],
			},
		];
		expect(
			project([...durable, node(9, source)]).nodes.get(source.scope) ?? [],
		).toEqual([]);
		expect(prepareImport(durable, [later]).invalidations).toEqual([]);
	});
	it("invalidates catalog ancestors when losing incoming evidence excludes the current scope root", () => {
		const source = note(1);
		const root = node(2, source);
		const excluded = node(3, source);
		const earlier: JsonlLine = {
			...envelope(4),
			op: "invalidate",
			scope: source.scope,
			targets: [root.id],
		};
		const later = { ...earlier, at: envelope(5).at, targets: [excluded.id] };
		const catalog: NodeEvent = {
			...node(7, source),
			scope: "__catalog__:work",
			child_a: root.id,
		};
		const plan = prepareImport(
			[source, root, excluded, later, catalog],
			[earlier],
			new Map([["work", [source.scope]]]),
		);
		expect(plan.invalidations).toEqual([
			{ scope: catalog.scope, targets: [catalog.id] },
			{ scope: source.scope, targets: [root.id] },
		]);
	});
	it("validates every incoming copy before returning a write plan", () => {
		const source = note(1);
		expect(() =>
			prepareImport([source], [note(2), { ...source, op: "unknown" }]),
		).toThrow(expect.objectContaining({ code: "Data" }));
		expect(source.body).toBe("body");
	});
});

describe("proposal expiry", () => {
	const later = { id: id(5), at: "2026-12-11T00:00:00.000Z" };
	it("names each pending proposal past thirty days and no other", () => {
		const old = { ...note(1), proposed: true };
		const fresh = {
			...note(2),
			proposed: true,
			at: "2026-12-01T00:00:00.000Z",
		};
		const dismissed = { ...note(3), proposed: true };
		const close = {
			...envelope(4),
			op: "dismiss",
			scope: dismissed.scope,
			target: dismissed.id,
			reason: "ui dismiss",
		} as JsonlLine;
		expect(expiredProposals([old, fresh, dismissed, close], later.at)).toEqual([
			{ scope: old.scope, target: old.id },
		]);
	});
	it("adds one dismiss with the reason expired to a write plan", () => {
		const expired = {
			...note(1),
			at: "2020-01-01T00:00:00.000Z",
			proposed: true,
		};
		const plan = appendPlan([expired], payload(), later);
		const dismisses = plan.events.filter((event) => event.op === "dismiss");
		expect(dismisses).toHaveLength(1);
		expect(dismisses[0]).toMatchObject({
			target: expired.id,
			reason: "expired",
		});
		expect(plan.appended?.op).toBe("note");
		expect(plan.changed).toBe(2);
		const again = appendPlan(plan.events, payload("another"), {
			id: id(6),
			at: "2026-12-12T00:00:00.000Z",
		});
		expect(again.events.filter((event) => event.op === "dismiss")).toHaveLength(
			1,
		);
	});
	it("dismisses an expired proposal through an import plan", () => {
		const expired = {
			...note(1),
			at: "2020-01-01T00:00:00.000Z",
			proposed: true,
		};
		const plan = importPlan([expired], [note(2)]);
		expect(plan.events.filter((event) => event.op === "dismiss")).toHaveLength(
			1,
		);
	});
});
