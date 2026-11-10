/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check that core debug logs expose operation results without note or summary text.
 * #endregion moduleContract
 */

import { expect, it, vi } from "vitest";

const { logs } = vi.hoisted(() => ({ logs: [] as unknown[][] }));
vi.mock("node:util", async (original) => ({
	...(await original<typeof import("node:util")>()),
	debuglog:
		(namespace: string) =>
		(...data: unknown[]) =>
			logs.push([namespace, ...data]),
}));

import { mergeEvents } from "../src/domain/merge.js";
import { project, scopeTree } from "../src/domain/projection.js";
import { sanitizeEvent } from "../src/domain/sanitization.js";
import {
	buildInput,
	candidates,
	inputUnchanged,
	slice,
} from "../src/domain/tree.js";
import { prepareAppend, prepareImport } from "../src/domain/write.js";
import { JsonlStore } from "../src/storage/jsonl.js";
import type { JsonlLine, NoteEvent } from "../src/types/events.js";

it.each(["sanitized", "time", "hash"] as const)(
	"logs the %s conflict decision and winner without content",
	(reason) => {
		logs.length = 0;
		const source: NoteEvent = {
			id: "00000000000000000000000001",
			at: "2026-11-10T00:00:00.000Z",
			scope: "project:a",
			op: "note",
			body: "PRIVATE_NOTE_CONTENT",
			longform: "PRIVATE_DOCUMENT_CONTENT",
			kind: "note",
			ts: "2026-11-10T00:00:00.000Z",
			review_at: null,
			session: "s",
			turn: "t",
			preset: "p",
		};
		const other =
			reason === "sanitized"
				? sanitizeEvent(source)
				: reason === "time"
					? { ...source, at: "2026-11-10T00:00:01.000Z" }
					: { ...source, body: "PRIVATE_ALTERNATE_CONTENT" };
		mergeEvents([source], [other]);
		mergeEvents([other], [source]);
		const decisions = logs
			.filter(
				(entry) =>
					entry[0] === "memlens:merge" && entry[1] === "Conflict resolved",
			)
			.map((entry) => entry[2]);
		expect(decisions).toEqual([
			expect.objectContaining({ event: "conflict", id: source.id, reason }),
			expect.objectContaining({ event: "conflict", id: source.id, reason }),
		]);
		expect(
			new Set(decisions.map((value) => (value as { winner: string }).winner)),
		).toEqual(new Set(["left", "right"]));
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_NOTE_CONTENT");
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_ALTERNATE_CONTENT");
	},
);

it("exposes replay, erasure, fold, build, and storage outcomes without content", async () => {
	logs.length = 0;
	const events: JsonlLine[] = [0, 1, 2, 3].map((n) => ({
		id: String(n),
		at: `2026-11-10T00:00:0${n}.000Z`,
		scope: "project:a",
		op: "note",
		body: "PRIVATE_NOTE_CONTENT",
		longform: "PRIVATE_DOCUMENT_CONTENT",
		kind: "note",
		ts: "2026-11-10T00:00:00.000Z",
		review_at: null,
		session: "s",
		turn: "t",
		preset: "p",
	}));
	const tree = scopeTree(project(events), "project:a");
	const input = buildInput(tree, { start: 0, level: 1 });
	expect(input).not.toBeNull();
	if (input) expect(inputUnchanged(tree, input)).toBe(true);
	expect(candidates(tree)).toHaveLength(3);
	expect(slice(tree, 2)).toHaveLength(2);
	project([
		...events,
		{
			id: "redact",
			at: "2026-11-10T00:00:05.000Z",
			scope: "project:a",
			op: "redact",
			target: "0",
			reason: "erase",
		},
	]);
	const noteInput = {
		op: "note",
		scope: "project:a",
		body: "PRIVATE_NOTE_CONTENT",
		longform: "PRIVATE_DOCUMENT_CONTENT",
		kind: "note",
		ts: "2026-11-10T00:00:00.000Z",
		review_at: null,
		session: "s",
		turn: "t",
		preset: "p",
	};
	const envelope = {
		id: "00000000000000000000000001",
		at: "2026-11-10T00:00:00.000Z",
	};
	const appended = prepareAppend([], noteInput, envelope);
	prepareImport(appended.events, appended.events);
	prepareAppend(appended.events, noteInput, {
		...envelope,
		id: "00000000000000000000000002",
	});
	expect(() =>
		prepareAppend([], { ...noteInput, body: 42 }, envelope),
	).toThrow();
	const store = new JsonlStore();
	await expect(store.projection()).rejects.toMatchObject({ code: "Data" });
	await store.close();
	for (const message of [
		"Records ready",
		"Replay complete",
		"Redaction closure",
		"Build candidates",
		"Fold result",
		"Storage unavailable",
		"Merge complete",
		"Append prepared",
		"Import prepared",
		"Duplicate note",
		"Validation failed",
		"Invalidation complete",
	]) {
		expect(logs.some((entry) => entry[1] === message)).toBe(true);
	}
	expect(JSON.stringify(logs)).not.toContain("PRIVATE_NOTE_CONTENT");
	expect(JSON.stringify(logs)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
});
