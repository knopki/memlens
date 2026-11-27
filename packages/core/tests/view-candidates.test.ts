/**
 * #region moduleContract
 * @purpose Check that the maintenance screen counts the same candidates and dirty nodes as the view.
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
		const clean = await readConsole(
			store,
			config,
			scope,
			time,
			null,
			"maintenance",
		);
		expect(clean.candidates).toEqual([]);
		expect(clean.levels).toEqual([
			{ level: 1, nodes: 4, dirty: 0, candidates: 0 },
			{ level: 2, nodes: 2, dirty: 0, candidates: 0 },
			{ level: 3, nodes: 1, dirty: 0, candidates: 0 },
		]);
		expect(clean.totals).toEqual({ records: 8, nodes: 7, candidates: 0 });
		amend(store, { id: "note-0", body: "changed" });
		// Keep a stale key to check the node key, not only the missing node.
		store
			.handle()
			.prepare("UPDATE notes SET v_content = 'changed' WHERE id = 'note-6'")
			.run();
		const dirty = [
			{ level: 1, start: 0 },
			{ level: 1, start: 6 },
			{ level: 2, start: 0 },
			{ level: 3, start: 0 },
		];
		const index = indexOf(loadView(store.handle(), scope));
		expect(
			candidatesOf(index).sort(
				(a, b) => a.level - b.level || a.start - b.start,
			),
		).toEqual(dirty);
		const model = await readConsole(
			store,
			config,
			scope,
			time,
			null,
			"maintenance",
		);
		expect((model.candidates ?? []).map((row) => row.range)).toEqual(dirty);
		expect((model.candidates ?? []).every((row) => row.scope === scope)).toBe(
			true,
		);
		expect(model.levels).toEqual([
			{ level: 1, nodes: 3, dirty: 1, candidates: 2 },
			{ level: 2, nodes: 1, dirty: 0, candidates: 1 },
			{ level: 3, nodes: 0, dirty: 0, candidates: 1 },
		]);
		expect(model.totals).toEqual({ records: 8, nodes: 4, candidates: 4 });
		expect(candidates(store, scope)).toEqual([
			{ level: 1, start: 0 },
			{ level: 2, start: 0 },
			{ level: 1, start: 6 },
			{ level: 3, start: 0 },
		]);
		expect(candidatesOf(before)).toEqual([]);
	} finally {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
