/**
 * #region moduleContract
 * @purpose Verify selective invalidation of scope and catalog summary paths.
 * @scope Pure before-and-after plans, historical candidates, positions, and imports. No storage access.
 * @invariants Every supplied history passes runtime event and target validation before the planner runs.
 * #endregion moduleContract
 */

import { describe, expect, it, vi } from "vitest";

const { logs } = vi.hoisted(() => ({ logs: [] as unknown[][] }));
vi.mock("node:util", async (original) => ({
	...(await original<typeof import("node:util")>()),
	debuglog:
		(namespace: string) =>
		(...data: unknown[]) =>
			logs.push([namespace, ...data]),
}));

import { planInvalidation as domainPlanInvalidation } from "../src/domain/invalidation.js";
import { catalogKey } from "../src/domain/scope.js";
import { validateEvent, validateTargets } from "../src/domain/validation.js";
import type {
	AmendEvent,
	HideEvent,
	JsonlLine,
	NodeEvent,
	NoteEvent,
	ScopeKey,
} from "../src/types/events.js";

const id = (n: number) => `00000000000000000000${String(n).padStart(6, "0")}`;
const at = (n: number) =>
	new Date(Date.UTC(2026, 10, 10, 0, 0, n)).toISOString();
const scopeA = "project:a" as ScopeKey;
const scopeB = "project:b" as ScopeKey;
const scopeC = "project:c" as ScopeKey;

const note = (
	n: number,
	scope: ScopeKey = scopeA,
	fields: Partial<NoteEvent> = {},
): NoteEvent => ({
	id: id(n),
	at: at(n),
	scope,
	op: "note",
	body: `body ${n}`,
	kind: "note",
	ts: at(n),
	review_at: null,
	session: "s",
	turn: "t",
	preset: "p",
	...fields,
});

const node = (
	n: number,
	scope: ScopeKey,
	level: number,
	start: number,
	childA: string | null,
	childB: string | null,
	fields: Partial<NodeEvent> = {},
): NodeEvent => ({
	id: id(n),
	at: at(n),
	scope,
	op: "node",
	level,
	start,
	child_a: childA,
	child_b: childB,
	input_rev: null,
	summary: `summary ${n}`,
	chars: (fields.summary ?? `summary ${n}`).length,
	truncated: false,
	ts_from: at(1),
	ts_to: at(2),
	...fields,
});

const amend = (
	n: number,
	scope: ScopeKey,
	target: string,
	fields: Partial<AmendEvent> = {},
): AmendEvent => ({
	id: id(n),
	at: at(n),
	scope,
	op: "amend",
	target,
	...fields,
});

const hide = (n: number, scope: ScopeKey, target: string): HideEvent => ({
	id: id(n),
	at: at(n),
	scope,
	op: "hide",
	target,
	reason: "hidden",
});

// #region FUNC_planInvalidation
/** @purpose Enforce the planner's runtime preconditions for every test history. */
function planInvalidation(
	...args: Parameters<typeof domainPlanInvalidation>
): ReturnType<typeof domainPlanInvalidation> {
	for (const history of [args[0], args[1]]) {
		for (const event of history) validateEvent(event);
		validateTargets(history, true);
	}
	return domainPlanInvalidation(...args);
}
// #endregion FUNC_planInvalidation

describe("selective invalidation", () => {
	it("invalidates every historical candidate on a changed path even when the maximum revision stays equal", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const oldSummary = node(3, scopeA, 1, 0, first.id, second.id, {
			at: at(30),
			input_rev: `${at(20)}|${second.id}`,
		});
		const currentSummary = node(4, scopeA, 1, 0, first.id, second.id, {
			at: at(40),
			input_rev: `${at(20)}|${second.id}`,
		});
		const before: JsonlLine[] = [first, second, oldSummary, currentSummary];
		const after: JsonlLine[] = [
			...before,
			amend(5, scopeA, first.id, { at: at(15), body: "changed" }),
		];

		const plan = planInvalidation(before, after);
		expect(plan.ranges).toEqual([{ scope: scopeA, start: 0, level: 1 }]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [oldSummary.id, currentSummary.id] },
		]);
	});

	it("keeps an independent branch and its common prefix usable", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const third = note(3, scopeA, { at: at(30) });
		const fourth = note(4, scopeA, { at: at(40) });
		const left = node(5, scopeA, 1, 0, first.id, second.id, { at: at(50) });
		const right = node(6, scopeA, 1, 2, third.id, fourth.id, { at: at(60) });
		const root = node(7, scopeA, 2, 0, left.id, right.id, { at: at(70) });
		const before: JsonlLine[] = [
			first,
			second,
			third,
			fourth,
			left,
			right,
			root,
		];
		const after: JsonlLine[] = [
			...before,
			amend(8, scopeA, first.id, { at: at(15), body: "changed" }),
		];

		const plan = planInvalidation(before, after);
		expect(plan.ranges).toEqual([
			{ scope: scopeA, start: 0, level: 1 },
			{ scope: scopeA, start: 0, level: 2 },
		]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [left.id, root.id] },
		]);
	});

	it("preserves a common prefix when a tail join adds a larger root", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const third = note(3, scopeA, { at: at(30) });
		const fourth = note(4, scopeA, { at: at(40) });
		const oldLeft = node(5, scopeA, 1, 0, first.id, second.id, { at: at(50) });
		const oldRight = node(6, scopeA, 1, 2, third.id, fourth.id, { at: at(60) });
		const oldRoot = node(7, scopeA, 2, 0, oldLeft.id, oldRight.id, {
			at: at(70),
		});
		const fifth = note(8, scopeA, { at: at(80) });
		const sixth = note(9, scopeA, { at: at(90) });
		const newLeft = node(10, scopeA, 1, 4, fifth.id, sixth.id, { at: at(100) });
		const newRoot = node(11, scopeA, 2, 4, newLeft.id, null, { at: at(110) });
		const top = node(12, scopeA, 3, 0, oldRoot.id, newRoot.id, { at: at(120) });
		const before: JsonlLine[] = [
			first,
			second,
			third,
			fourth,
			oldLeft,
			oldRight,
			oldRoot,
		];
		const after: JsonlLine[] = [...before, fifth, sixth, newLeft, newRoot, top];

		const plan = planInvalidation(before, after);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [newLeft.id, newRoot.id, top.id] },
		]);
		expect(plan.ranges).toContainEqual({ scope: scopeA, start: 0, level: 3 });
		expect(plan.ranges).not.toContainEqual({
			scope: scopeA,
			start: 0,
			level: 2,
		});
	});

	it("marks both old and new paths for an inserted position", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const pair = node(3, scopeA, 1, 0, first.id, second.id, { at: at(30) });
		const inserted = note(4, scopeA, { at: at(0) });
		const before: JsonlLine[] = [first, second, pair];
		const after: JsonlLine[] = [inserted, first, second, pair];

		const plan = planInvalidation(before, after);
		expect(plan.ranges).toEqual([
			{ scope: scopeA, start: 0, level: 1 },
			{ scope: scopeA, start: 0, level: 2 },
			{ scope: scopeA, start: 2, level: 1 },
		]);
		expect(plan.invalidations).toEqual([{ scope: scopeA, targets: [pair.id] }]);
	});

	it("marks the old and new scope paths of a moved record", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeB, { at: at(20) });
		const left = node(3, scopeA, 1, 0, first.id, null, { at: at(30) });
		const right = node(4, scopeB, 1, 0, second.id, null, { at: at(40) });
		const before: JsonlLine[] = [first, second, left, right];
		const after: JsonlLine[] = [
			...before,
			amend(5, scopeB, first.id, { at: at(50) }),
		];

		const plan = planInvalidation(before, after);
		expect(plan.ranges).toEqual([
			{ scope: scopeA, start: 0, level: 1 },
			{ scope: scopeB, start: 0, level: 1 },
		]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [left.id] },
			{ scope: scopeB, targets: [right.id] },
		]);
	});

	it("invalidates the old and new catalog paths when a scope extends the catalog root", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeB, { at: at(20) });
		const topA = node(3, scopeA, 1, 0, first.id, null, { at: at(30) });
		const topB = node(4, scopeB, 1, 0, second.id, null, { at: at(40) });
		const catalog = catalogKey("p");
		const oldCatalog = node(5, catalog, 1, 0, topA.id, topB.id, { at: at(50) });
		const third = note(6, scopeC, { at: at(60) });
		const topC = node(7, scopeC, 1, 0, third.id, null, { at: at(70) });
		const rightCatalog = node(8, catalog, 1, 2, topC.id, null, { at: at(80) });
		const newCatalog = node(9, catalog, 2, 0, oldCatalog.id, rightCatalog.id, {
			at: at(90),
		});
		const before: JsonlLine[] = [first, second, topA, topB, oldCatalog];
		const after: JsonlLine[] = [
			...before,
			third,
			topC,
			rightCatalog,
			newCatalog,
		];
		const profiles = new Map([["p", [scopeA, scopeB, scopeC]]]);

		const plan = planInvalidation(before, after, profiles);
		expect(plan.invalidations).toEqual([
			{ scope: catalog, targets: [rightCatalog.id, newCatalog.id] },
			{ scope: scopeC, targets: [topC.id] },
		]);
		expect(plan.ranges).toEqual([
			{ scope: catalog, start: 0, level: 2 },
			{ scope: catalog, start: 2, level: 1 },
			{ scope: scopeC, start: 0, level: 1 },
		]);
	});

	it("invalidates old and new catalog paths when a scope position shifts", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeB, { at: at(20) });
		const topA = node(3, scopeA, 1, 0, first.id, null, { at: at(30) });
		const topB = node(4, scopeB, 1, 0, second.id, null, { at: at(40) });
		const catalog = catalogKey("p");
		const oldCatalog = node(5, catalog, 1, 0, topA.id, topB.id, { at: at(50) });
		const early = note(6, scopeC, { at: at(5) });
		const topC = node(7, scopeC, 1, 0, early.id, null, { at: at(60) });
		const leftCatalog = node(8, catalog, 1, 0, topC.id, topA.id, {
			at: at(70),
		});
		const rightCatalog = node(9, catalog, 1, 2, topB.id, null, { at: at(80) });
		const rootCatalog = node(
			10,
			catalog,
			2,
			0,
			leftCatalog.id,
			rightCatalog.id,
			{ at: at(90) },
		);
		const before: JsonlLine[] = [first, second, topA, topB, oldCatalog];
		const after: JsonlLine[] = [
			...before,
			early,
			topC,
			leftCatalog,
			rightCatalog,
			rootCatalog,
		];
		const profiles = new Map([["p", [scopeA, scopeB, scopeC]]]);

		const plan = planInvalidation(before, after, profiles);
		expect(plan.invalidations).toEqual([
			{
				scope: catalog,
				targets: [
					oldCatalog.id,
					leftCatalog.id,
					rightCatalog.id,
					rootCatalog.id,
				],
			},
			{ scope: scopeC, targets: [topC.id] },
		]);
		expect(plan.ranges).toEqual([
			{ scope: catalog, start: 0, level: 1 },
			{ scope: catalog, start: 0, level: 2 },
			{ scope: catalog, start: 2, level: 1 },
			{ scope: scopeC, start: 0, level: 1 },
		]);
	});

	it("keeps catalog summaries usable when an imported root leaves the local root unchanged", () => {
		const first = note(1, scopeA, { at: at(10) });
		const localRoot = node(2, scopeA, 1, 0, first.id, null, { at: at(20) });
		const catalog = catalogKey("p");
		const catalogNode = node(3, catalog, 1, 0, localRoot.id, null, {
			at: at(30),
		});
		const imported = node(4, scopeA, 1, 0, first.id, null, { at: at(40) });
		const before: JsonlLine[] = [first, localRoot, catalogNode];
		const after: JsonlLine[] = [...before, imported];

		const plan = planInvalidation(before, after, new Map([["p", [scopeA]]]), [
			imported.id,
		]);
		expect(plan.ranges).toEqual([]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [imported.id] },
		]);
	});

	it("invalidates a catalog ancestor without targeting a new local scope root", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeB, { at: at(20) });
		const topA = node(3, scopeA, 1, 0, first.id, null, { at: at(30) });
		const topB = node(4, scopeB, 1, 0, second.id, null, { at: at(40) });
		const catalog = catalogKey("p");
		const catalogNode = node(5, catalog, 1, 0, topA.id, topB.id, {
			at: at(50),
		});
		const rebuiltTopA = node(6, scopeA, 1, 0, first.id, null, { at: at(60) });
		const before: JsonlLine[] = [first, second, topA, topB, catalogNode];
		const after: JsonlLine[] = [...before, rebuiltTopA];
		const profiles = new Map([["p", [scopeA, scopeB]]]);

		const plan = planInvalidation(before, after, profiles);
		expect(plan.invalidations).toEqual([
			{ scope: catalog, targets: [catalogNode.id] },
		]);
		expect(plan.invalidations.flatMap((item) => item.targets)).not.toContain(
			rebuiltTopA.id,
		);
		expect(plan.ranges).toEqual([{ scope: catalog, start: 0, level: 1 }]);
	});

	it("targets an imported node without invalidating unchanged local ancestors", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const third = note(3, scopeA, { at: at(30) });
		const fourth = note(4, scopeA, { at: at(40) });
		const left = node(5, scopeA, 1, 0, first.id, second.id, { at: at(50) });
		const right = node(6, scopeA, 1, 2, third.id, fourth.id, { at: at(60) });
		const root = node(7, scopeA, 2, 0, left.id, right.id, { at: at(70) });
		const imported = node(8, scopeA, 1, 0, first.id, second.id, { at: at(80) });
		const before: JsonlLine[] = [
			first,
			second,
			third,
			fourth,
			left,
			right,
			root,
		];
		const after: JsonlLine[] = [...before, imported];

		const plan = planInvalidation(before, after, new Map(), [imported.id]);
		expect(plan.ranges).toEqual([]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [imported.id] },
		]);
		expect(planInvalidation(after, after)).toEqual({
			ranges: [],
			invalidations: [],
		});
	});

	it("invalidates ancestors when a changed imported candidate has no local fallback", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const third = note(3, scopeA, { at: at(30) });
		const fourth = note(4, scopeA, { at: at(40) });
		const leftBefore = node(5, scopeA, 1, 0, first.id, second.id, {
			at: at(50),
		});
		const right = node(6, scopeA, 1, 2, third.id, fourth.id, { at: at(60) });
		const root = node(7, scopeA, 2, 0, leftBefore.id, right.id, { at: at(70) });
		const leftAfter = {
			...leftBefore,
			at: at(80),
			summary: "changed",
			chars: 7,
		};
		const before: JsonlLine[] = [
			first,
			second,
			third,
			fourth,
			leftBefore,
			right,
			root,
		];
		const after: JsonlLine[] = [
			first,
			second,
			third,
			fourth,
			leftAfter,
			right,
			root,
		];

		const plan = planInvalidation(before, after, new Map(), [leftBefore.id]);
		expect(plan.ranges).toEqual([{ scope: scopeA, start: 0, level: 2 }]);
		expect(plan.invalidations).toEqual([
			{ scope: scopeA, targets: [leftBefore.id, root.id] },
		]);
	});

	it("ignores hidden changes but invalidates a live record that becomes hidden", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const pair = node(3, scopeA, 1, 0, first.id, second.id, { at: at(30) });
		const hiddenBefore: JsonlLine[] = [
			first,
			second,
			hide(4, scopeA, first.id),
			pair,
		];
		const hiddenAfter: JsonlLine[] = [
			...hiddenBefore,
			amend(5, scopeA, first.id, { at: at(40), body: "hidden changed" }),
		];
		expect(planInvalidation(hiddenBefore, hiddenAfter)).toEqual({
			ranges: [],
			invalidations: [],
		});

		const visibleBefore: JsonlLine[] = [first, second, pair];
		const visibleAfter: JsonlLine[] = [
			...visibleBefore,
			hide(6, scopeA, first.id),
		];
		expect(planInvalidation(visibleBefore, visibleAfter).invalidations).toEqual(
			[{ scope: scopeA, targets: [pair.id] }],
		);
	});

	it("skips sanitized candidates and ids that already have invalidation events", () => {
		const first = note(1, scopeA, { at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const raw = node(3, scopeA, 1, 0, first.id, second.id, { at: at(30) });
		const sanitized = {
			...node(4, scopeA, 1, 0, first.id, second.id, { at: at(40) }),
			summary: "",
			chars: 0,
			redacted: true,
		} as JsonlLine;
		const invalidTarget = node(5, scopeA, 1, 0, first.id, second.id, {
			at: at(50),
		});
		const invalidation: JsonlLine = {
			id: id(6),
			at: at(60),
			scope: scopeA,
			op: "invalidate",
			targets: [invalidTarget.id],
		};
		const before: JsonlLine[] = [
			first,
			second,
			raw,
			sanitized,
			invalidTarget,
			invalidation,
		];
		const after: JsonlLine[] = [
			...before,
			amend(7, scopeA, first.id, { at: at(15), body: "changed" }),
		];

		const plan = planInvalidation(before, after);
		expect(plan.invalidations).toEqual([{ scope: scopeA, targets: [raw.id] }]);
	});

	it("logs start, paths, and result without note or summary content", () => {
		logs.length = 0;
		const first = note(1, scopeA, { body: "PRIVATE_NOTE_CONTENT", at: at(10) });
		const second = note(2, scopeA, { at: at(20) });
		const summary = node(3, scopeA, 1, 0, first.id, second.id, {
			at: at(30),
			summary: "PRIVATE_SUMMARY_CONTENT",
		});
		planInvalidation(
			[first, second, summary],
			[
				first,
				second,
				summary,
				amend(4, scopeA, first.id, { at: at(15), body: "changed" }),
			],
		);
		for (const message of [
			"Invalidation start",
			"Invalidation path",
			"Invalidation complete",
		]) {
			expect(logs.some((entry) => entry[1] === message)).toBe(true);
		}
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_NOTE_CONTENT");
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_SUMMARY_CONTENT");
	});
});
