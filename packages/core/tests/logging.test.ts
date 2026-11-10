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

import { project, scopeTree } from "../src/domain/projection.js";
import {
	buildInput,
	candidates,
	inputUnchanged,
	slice,
} from "../src/domain/tree.js";
import { JsonlStore } from "../src/storage/jsonl.js";
import type { JsonlLine } from "../src/types/events.js";

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
	]) {
		expect(logs.some((entry) => entry[1] === message)).toBe(true);
	}
	expect(JSON.stringify(logs)).not.toContain("PRIVATE_NOTE_CONTENT");
	expect(JSON.stringify(logs)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
});
