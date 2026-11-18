/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove that a cleared note leaves no proposal payload that targets it after an import.
 * @scope One import of a cleared note into a store with local proposals, through the public store API.
 * @invariants Each test builds its own store directories and removes them at the end.
 * @keywords test, transfer, cleared, proposal, redact, merge
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it } from "vitest";
import { note, propose, redact } from "../src/index.js";
import { Store } from "../src/store/store.js";
import { exportLines, importLines } from "../src/store/transfer.js";
import type { ScopeKey } from "../src/types/primitives.js";

const dirs: string[] = [];

const stores: Store[] = [];

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Create one real store and keep it for the teardown. */
function makeStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-transfer-cleared-"));
	dirs.push(dir);
	const store = new Store(dir, "en");
	stores.push(store);
	return store;
}

const scope = "p:transfer" as ScopeKey;

const base = {
	scope,
	kind: "note" as const,
	session: "s",
	turn: "t",
	preset: "p",
};

describe("cleared import", () => {
	it("deletes each proposal payload that targets a cleared note", () => {
		const source = makeStore();
		const target = makeStore();
		const local = note(source, { ...base, body: "local secret" });
		assert.equal(local.ok, true);
		importLines(target, exportLines(source));
		const late = note(source, { ...base, body: "late secret" });
		assert.equal(late.ok, true);
		assert.equal(
			target
				.handle()
				.prepare("SELECT id FROM notes WHERE id = ?")
				.get(late.value.id),
			undefined,
		);
		propose(target, {
			id: "proposal-merged",
			scope,
			op: "amend",
			target: local.value.id,
			payload: { body: "local secret" },
		});
		propose(target, {
			id: "proposal-missing",
			scope,
			op: "amend",
			target: late.value.id,
			payload: { body: "late secret" },
		});
		propose(target, {
			id: "proposal-untouched",
			scope,
			op: "amend",
			target: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			payload: { body: "unrelated" },
		});
		redact(source, local.value.id, "user request");
		redact(source, late.value.id, "user request");
		const result = importLines(target, exportLines(source));
		assert.equal(result.clearedApplied, true);
		const row = target
			.handle()
			.prepare("SELECT state, cleared, body, longform FROM notes WHERE id = ?")
			.get(local.value.id);
		assert.equal(row?.state, "deleted");
		assert.equal(row?.cleared, 1);
		assert.equal(row?.body, "");
		assert.equal(row?.longform, null);
		const absent = target
			.handle()
			.prepare("SELECT state, cleared, body FROM notes WHERE id = ?")
			.get(late.value.id);
		assert.equal(absent?.state, "deleted");
		assert.equal(absent?.cleared, 1);
		assert.equal(absent?.body, "");
		const proposals = target
			.handle()
			.prepare("SELECT id, target FROM proposals ORDER BY id")
			.all()
			.map((item) => ({ id: String(item.id), target: String(item.target) }));
		assert.deepEqual(proposals, [
			{ id: "proposal-untouched", target: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
		]);
		propose(target, {
			id: "proposal-after-clear",
			scope,
			op: "amend",
			target: local.value.id,
			payload: { body: "local secret" },
		});
		importLines(target, exportLines(source));
		assert.equal(
			target
				.handle()
				.prepare("SELECT id FROM proposals WHERE id = ?")
				.get("proposal-after-clear"),
			undefined,
		);
	});
});
