/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check both backend stubs against the same port without a false persistence result.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { JsonlStore } from "../src/storage/jsonl.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { AppendEvent, StorePort } from "../src/types/store.js";

for (const Store of [SqliteStore, JsonlStore]) {
	describe(Store.name, () => {
		it("rejects data operations and permits repeated cleanup", async () => {
			const store: StorePort = new Store();
			const note: AppendEvent = {
				op: "note",
				scope: "project:a",
				body: "body",
				kind: "note",
				ts: "2026-11-10T00:00:00.000Z",
				review_at: null,
				session: "s",
				turn: "t",
				preset: "p",
			};
			const operations = [
				() => store.append(note),
				() => store.projection(),
				() => store.rev(),
				() => store.export(null),
				() => store.import([]),
				() =>
					store.appendNode(
						{ range: { start: 0, level: 1 }, children: [null, null] },
						{
							op: "node",
							scope: "project:a",
							start: 0,
							level: 1,
							child_a: null,
							child_b: null,
							input_rev: null,
							summary: "",
							chars: 0,
							truncated: false,
							ts_from: note.ts,
							ts_to: note.ts,
						},
					),
			];
			for (const operation of operations) {
				await expect(operation()).rejects.toMatchObject({
					code: "Data",
					message: expect.stringContaining("not implemented"),
				});
			}
			await expect(store.close()).resolves.toBeUndefined();
			await expect(store.close()).resolves.toBeUndefined();
		});
	});
}
