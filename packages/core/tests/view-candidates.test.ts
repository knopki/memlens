/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check that candidate ranges and console validity agree with the current scope rows.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadBaseConfig, resolveConfig } from "../src/domain/config.js";
import { readConsole } from "../src/domain/console.js";
import { candidates, publishJoin, readBuild } from "../src/store/build.js";
import { amend, note } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import {
	candidatesOf,
	indexOf,
	loadView,
	nodeRowsOf,
} from "../src/store/view.js";

it("keeps changed ranges dirty and valid nodes out of candidates across readers", async () => {
	const dir = mkdtempSync(join(tmpdir(), "memlens-candidates-"));
	const store = new Store(dir);
	try {
		const scope = "project:test";
		const config = resolveConfig(loadBaseConfig(null, "/unused"), {}, null);
		const time = "2026-11-19T10:00:00.000Z";
		for (let pos = 0; pos < 8; pos++) {
			expect(
				note(store, {
					id: `note-${pos}`,
					scope,
					kind: "note",
					body: `note ${pos}`,
					ts: time,
					session: "test",
					turn: "test",
					preset: "test",
				}).ok,
			).toBe(true);
		}
		for (let level = 1; level <= 3; level++) {
			for (let start = 0; start < 8; start += 2 ** level) {
				const read = readBuild(store, scope, level, start);
				if (!read.ok) throw new Error("No build input");
				expect(publishJoin(store, scope, level, start, read).ok).toBe(true);
			}
		}
		const before = indexOf(loadView(store.handle(), scope));
		expect(candidatesOf(before)).toEqual([]);
		expect(nodeRowsOf(before).every((row) => row.clean)).toBe(true);
		amend(store, { id: "note-0", body: "changed" });
		const dirty = [
			{ level: 1, start: 0 },
			{ level: 2, start: 0 },
			{ level: 3, start: 0 },
		];
		expect(candidates(store, scope)).toEqual(dirty);
		// Keep a stale row to check its keys, not only the absence of covering nodes.
		store
			.handle()
			.prepare("UPDATE notes SET v_content = 'changed' WHERE id = 'note-6'")
			.run();
		const index = indexOf(loadView(store.handle(), scope));
		const expected = [dirty[0], { level: 1, start: 6 }, dirty[1], dirty[2]];
		expect(
			candidatesOf(index).sort(
				(a, b) => a.level - b.level || a.start - b.start,
			),
		).toEqual(expected);
		const model = await readConsole(store, config, scope, time);
		expect(model.candidates.map((row) => row.range)).toEqual(expected);
		expect(model.nodes).toEqual(nodeRowsOf(index));
		expect(
			model.nodes.map(({ node, clean }) => [node.level, node.start, clean]),
		).toEqual([
			[1, 2, true],
			[1, 4, true],
			[1, 6, false],
			[2, 4, true],
		]);
		expect(candidates(store, scope)).toEqual([
			dirty[0],
			dirty[1],
			{ level: 1, start: 6 },
			dirty[2],
		]);
		expect(candidatesOf(before)).toEqual([]);
	} finally {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
