/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check build snapshots, the rounds of the compaction, and conditional publication
 * against store rows.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	candidates,
	childOf,
	publishJoin,
	publishNode,
	readBuild,
	readRound,
} from "../src/store/build.js";
import { amend, hide, note } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";

const dirs: string[] = [];

const stores: Store[] = [];
afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function open(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-build-"));
	dirs.push(dir);
	const store = new Store(dir);
	stores.push(store);
	return store;
}

function add(store: Store, body: string, day: number) {
	const result = note(store, {
		scope: "p:x",
		kind: "note",
		body,
		session: "s",
		turn: "t",
		preset: "p",
		ts: `2026-01-0${day}T00:00:00.000Z`,
	});
	if (!result.ok) throw new Error(result.reason);
	return result.value;
}
describe("store build", () => {
	it("reads live halves, joins them, and omits valid candidates", () => {
		const store = open();
		add(store, "first", 1);
		add(store, "second", 2);
		const read = readBuild(store, "p:x", 1, 0);
		expect(read.ok).toBe(true);
		if (!read.ok) throw new Error("empty");
		expect(read).toMatchObject({
			aText: "first",
			bText: "second",
			fits: true,
			tsFrom: "2026-01-01T00:00:00.000Z",
			tsTo: "2026-01-02T00:00:00.000Z",
		});
		expect(publishJoin(store, "p:x", 1, 0, read).ok).toBe(true);
		expect(candidates(store, "p:x")).toEqual([]);
	});
	it("rejects stale keys without a clock or node write", () => {
		const store = open();
		const first = add(store, "first", 1);
		add(store, "second", 2);
		const read = readBuild(store, "p:x", 1, 0);
		if (!read.ok) throw new Error("empty");
		amend(store, { id: first.id, body: "changed" });
		const rev = store.rev();
		expect(publishNode(store, "p:x", 1, 0, "old", read)).toEqual({
			ok: false,
			reason: "input_changed",
		});
		expect(store.rev()).toBe(rev);
		expect(
			store.handle().prepare("SELECT count(*) AS n FROM nodes").get()?.n,
		).toBe(0);
	});
	it("reads child nodes and rejects a replaced child", () => {
		const store = open();
		for (let i = 1; i <= 4; i++) add(store, `note ${i}`, i);
		for (const start of [0, 2]) {
			const read = readBuild(store, "p:x", 1, start);
			if (!read.ok) throw new Error("empty");
			expect(publishJoin(store, "p:x", 1, start, read).ok).toBe(true);
		}
		const parent = readBuild(store, "p:x", 2, 0);
		if (!parent.ok) throw new Error("empty");
		expect(parent).toMatchObject({
			aText: "note 1; note 2",
			bText: "note 3; note 4",
		});
		const child = readBuild(store, "p:x", 1, 0);
		if (!child.ok) throw new Error("empty");
		publishJoin(store, "p:x", 1, 0, child);
		expect(publishJoin(store, "p:x", 2, 0, parent)).toEqual({
			ok: false,
			reason: "input_changed",
		});
	});
	it("gives each half its own date span", () => {
		const store = open();
		for (const day of [1, 2, 5, 6]) add(store, `note ${day}`, day);
		for (const start of [0, 2]) {
			const read = readBuild(store, "p:x", 1, start);
			if (!read.ok) throw new Error("empty");
			publishJoin(store, "p:x", 1, start, read);
		}
		const parent = readBuild(store, "p:x", 2, 0);
		if (!parent.ok) throw new Error("empty");
		expect(parent).toMatchObject({
			tsFrom: "2026-01-01T00:00:00.000Z",
			tsTo: "2026-01-06T00:00:00.000Z",
			aFrom: "2026-01-01T00:00:00.000Z",
			aTo: "2026-01-02T00:00:00.000Z",
			bFrom: "2026-01-05T00:00:00.000Z",
			bTo: "2026-01-06T00:00:00.000Z",
		});
		expect(childOf(parent, { start: 0, level: 2 }, 0)).toMatchObject({
			kind: "node",
			range: { start: 0, level: 1 },
			ts_from: "2026-01-01T00:00:00.000Z",
			ts_to: "2026-01-02T00:00:00.000Z",
		});
		expect(childOf(parent, { start: 0, level: 2 }, 2)).toMatchObject({
			kind: "node",
			range: { start: 2, level: 1 },
			ts_from: "2026-01-05T00:00:00.000Z",
			ts_to: "2026-01-06T00:00:00.000Z",
		});
	});
	it("gives each record its own date", () => {
		const store = open();
		add(store, "first", 1);
		add(store, "second", 2);
		const read = readBuild(store, "p:x", 1, 0);
		if (!read.ok) throw new Error("empty");
		expect(childOf(read, { start: 0, level: 1 }, 0)).toMatchObject({
			kind: "record",
			ts: "2026-01-01T00:00:00.000Z",
			preview: "",
		});
		expect(childOf(read, { start: 0, level: 1 }, 1)).toMatchObject({
			kind: "record",
			pos: 1,
			ts: "2026-01-02T00:00:00.000Z",
		});
	});
	it("uses null keys for hidden halves and refuses long joins", () => {
		const store = open();
		const first = add(store, "a".repeat(400), 1);
		add(store, "b".repeat(400), 2);
		const full = readBuild(store, "p:x", 1, 0);
		if (!full.ok) throw new Error("empty");
		expect(publishJoin(store, "p:x", 1, 0, full)).toEqual({
			ok: false,
			reason: "no_fit",
		});
		hide(store, first.id);
		const read = readBuild(store, "p:x", 1, 0);
		expect(read).toMatchObject({ aKey: null, aText: null, fits: true });
	});
	it("reads one round of an oversized pair without a write", () => {
		const store = open();
		add(store, "a".repeat(400), 1);
		add(store, "b".repeat(400), 2);
		const rev = store.rev();
		const round = readRound(store, "p:x");
		expect(round).toHaveLength(1);
		expect(round[0]?.read.fits).toBe(false);
		expect(store.rev()).toBe(rev);
	});
});
