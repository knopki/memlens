/**
 * #region moduleContract
 * @purpose Check the public core entry point.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	foldPositions,
	loadView,
	NAME,
	note,
	Store,
	sliceOf,
} from "../src/index.js";

describe("@memlens/core", () => {
	it("exports the product name and the pure fold", () => {
		expect(NAME).toBe("memlens");
		expect(foldPositions([0, 1, 2], 3, 2)).toEqual([
			{ start: 0, level: 1 },
			{ start: 2, level: 0 },
		]);
	});

	it("writes and reads a note through public exports", () => {
		const directory = mkdtempSync(join(tmpdir(), "memlens-index-"));
		const store = new Store(directory);
		try {
			note(store, {
				scope: "project:a",
				body: "public note",
				kind: "fact",
				session: "s",
				turn: "t",
				preset: "p",
			});
			expect(sliceOf(loadView(store.handle(), "project:a"), 2)).toEqual([
				expect.objectContaining({ kind: "record", body: "public note" }),
			]);
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
