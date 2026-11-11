/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the core entry point and the complete pure replay path available to frontends.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	buildInput,
	candidates,
	inputUnchanged,
	type JsonlLine,
	JsonlStore,
	NAME,
	prepareAppend,
	prepareImport,
	project,
	SqliteStore,
	scopeTree,
	slice,
} from "../src/index.js";

describe("@memlens/core", () => {
	it("exports the product name", () => {
		expect(NAME).toBe("memlens");
	});

	it("prepares runtime writes and repeat imports through public exports", () => {
		const plan = prepareAppend(
			[],
			{
				op: "note",
				scope: "Project:A",
				body: "  public  note ",
				kind: "fact",
				ts: "2026-11-10T00:00:00.000Z",
				review_at: null,
				session: "s",
				turn: "t",
				preset: "p",
			},
			{ id: "00000000000000000000000001", at: "2026-11-10T00:00:00.000Z" },
		);
		expect(
			plan.projection.records.get("00000000000000000000000001"),
		).toMatchObject({ body: "public note", scope: "project:a" });
		expect(prepareImport(plan.events, plan.events).changed).toBe(0);
	});

	it("replays, slices, and prepares compaction inputs through public exports", async () => {
		const events: JsonlLine[] = [0, 1, 2, 3].map((n) => ({
			id: String(n),
			at: `2026-11-10T00:00:0${n}.000Z`,
			scope: "project:a",
			op: "note",
			body: `note ${n}`,
			kind: "note",
			ts: "2026-11-10T00:00:00.000Z",
			review_at: null,
			session: "session",
			turn: "turn",
			preset: "preset",
		}));
		const tree = scopeTree(project(events), "project:a");
		expect(slice(tree, 3)).toEqual([
			{
				kind: "temporary",
				range: { start: 0, level: 1 },
				from: events[0]?.at,
				to: events[0]?.at,
				text: "note 0; note 1",
			},
			{
				kind: "record",
				pos: 2,
				from: events[0]?.at,
				to: events[0]?.at,
				body: "note 2",
			},
			{
				kind: "record",
				pos: 3,
				from: events[0]?.at,
				to: events[0]?.at,
				body: "note 3",
			},
		]);
		expect(candidates(tree)[0]).toEqual({ start: 0, level: 1 });
		const input = buildInput(tree, { start: 0, level: 1 });
		if (!input) throw new Error("Expected ready input.");
		expect(inputUnchanged(tree, input)).toBe(true);
		const erased = project([
			...events,
			{
				id: "erase",
				at: "2026-11-10T00:00:05.000Z",
				scope: "project:a",
				op: "redact",
				target: "0",
				reason: "erase",
			},
		]);
		expect(inputUnchanged(scopeTree(erased, "project:a"), input)).toBe(false);
		expect(SqliteStore.name).toBe("SqliteStore");
		expect(JsonlStore.name).toBe("JsonlStore");
	});
});
