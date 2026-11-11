/**
 * #region moduleContract
 * @purpose Check that a target text becomes one record of one visible scope, or one named error.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { project } from "../src/domain/projection.js";
import { resolveTarget } from "../src/domain/targets.js";
import type { JsonlLine, NoteEvent } from "../src/types/events.js";

const at = (n: number) => `2026-11-10T00:00:${String(n).padStart(2, "0")}.000Z`;
const note = (n: number, scope = "project:a"): NoteEvent => ({
	id: String(n),
	at: at(n),
	scope: scope as `${string}:${string}`,
	op: "note",
	body: `body ${n}`,
	kind: "fact",
	ts: at(0),
	review_at: null,
	session: "session",
	turn: "turn",
	preset: "preset",
});

const events: readonly JsonlLine[] = [note(1), note(2), note(3, "project:b")];
const projection = project(events);
const visible = ["project:a", "project:b"] as const;

describe("resolveTarget", () => {
	it("takes the scope of the address and the record at its position", () => {
		const result = resolveTarget(projection, visible, "project:a#1", null);
		expect(result.scope).toBe("project:a");
		expect(result.record.body).toBe("body 2");
	});

	it("takes the scope flag when the address holds no scope", () => {
		const result = resolveTarget(projection, visible, "0", "project:b");
		expect(result.scope).toBe("project:b");
		expect(result.record.body).toBe("body 3");
	});

	it("refuses a target without a scope", () => {
		expect(() => resolveTarget(projection, visible, "1", null)).toThrow(
			"needs a scope",
		);
	});

	it("refuses a range target and a text that is no address", () => {
		expect(() =>
			resolveTarget(projection, visible, "0-1", "project:a"),
		).toThrow("must name one record");
		expect(() =>
			resolveTarget(projection, visible, "abc", "project:a"),
		).toThrow("is not an address");
	});

	it("refuses a scope outside the visible list", () => {
		expect(() =>
			resolveTarget(projection, ["project:a"], "project:b#0", null),
		).toThrow("is not visible");
	});

	it("refuses a position with no record", () => {
		expect(() => resolveTarget(projection, visible, "7", "project:a")).toThrow(
			"No record of project:a is at 7",
		);
	});
});
