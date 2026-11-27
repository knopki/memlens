/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check merge attempts, batch answers, job answers, pacing, and one compaction pass.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	compactionPass,
	publishRound,
	RateWindow,
	retryDelay,
} from "../src/domain/compaction.js";
import {
	answerLine,
	batchTask,
	childLine,
	copyBuild,
	joinBuild,
	MERGE_SYSTEM,
	MERGE_SYSTEM_BATCH,
	OUTPUT_MANY,
	OUTPUT_ONE,
	parseBatchAnswer,
} from "../src/domain/merge-line.js";
import { candidates } from "../src/store/build.js";
import { amend, hide, note } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import { loadView, sliceOf } from "../src/store/view.js";
import type { BuildChild, BuildInput } from "../src/types/tree.js";

const record = (pos: number, body: string): BuildChild => ({
	kind: "record",
	id: `r${pos}`,
	pos,
	body,
	preview: "",
	ts: `2026-11-0${(pos % 9) + 1}`,
});

const input = (a: BuildChild, b: BuildChild | null): BuildInput => ({
	range: { start: 0, level: 1 },
	children: [a, b],
});

describe("prompts", () => {
	it("renders a child as the model reads it", () => {
		expect(childLine(record(3, "body"))).toBe("#3 2026-11-04\nbody");
		expect(
			childLine({ ...record(0, "doc"), preview: "first 1024 chars" }),
		).toBe("#0 2026-11-01\ndoc\nfirst 1024 chars");
		expect(
			childLine({
				kind: "node",
				id: "n1",
				range: { start: 0, level: 2 },
				summary: "sum",
				ts_from: "2026-11-01",
				ts_to: "2026-11-02",
			}),
		).toBe("#0-3 2026-11-01..02\nsum");
		expect(
			childLine({
				kind: "node",
				id: "catalog",
				pos: 2,
				range: { start: 0, level: 1 },
				summary: "scope root",
				ts_from: "2026-11-01",
				ts_to: "2026-11-02",
			}),
		).toBe("#2 2026-11-01..02\nscope root");
	});

	it("asks one batch call for each input block", () => {
		const task = batchTask(512, [input(record(0, "a"), record(1, "b"))]);
		expect(task).toContain('"#a-b: line"');
		expect(task).toContain('<input id="#0-1">');
		expect(task).toContain("</input>");
	});

	it("keeps the map rule in the system prompt and in the last task", () => {
		expect(MERGE_SYSTEM).toContain(
			"A line is a map of its children, not a join of them.",
		);
		expect(MERGE_SYSTEM).toContain("The example below is invented");
		expect(batchTask(512, [input(record(0, "a"), record(1, "b"))])).toContain(
			"not a join of the children's sentences",
		);
	});

	it("gives the batch form its own answer sentence", () => {
		expect(MERGE_SYSTEM.endsWith(OUTPUT_ONE)).toBe(true);
		expect(MERGE_SYSTEM_BATCH.endsWith(OUTPUT_MANY)).toBe(true);
		expect(MERGE_SYSTEM_BATCH).not.toContain(OUTPUT_ONE);
	});

	it("names the scope of each child in a catalog job", () => {
		const scopeChild = (
			id: string,
			pos: number,
			level: number,
			summary: string,
			from: string,
			to: string,
		): BuildChild => ({
			kind: "node",
			id,
			pos,
			range: { start: 0, level },
			summary,
			ts_from: from,
			ts_to: to,
		});
		const task = batchTask(
			512,
			[
				input(
					scopeChild("n1", 0, 1, "alpha", "2026-11-01", "2026-11-02"),
					scopeChild("n2", 1, 2, "beta", "2026-11-03", "2026-11-04"),
				),
			],
			["project:a", "project:b"],
		);
		expect(task).toContain("[project:a] 2026-11-01..02\nalpha");
		expect(task).toContain("[project:b] 2026-11-03..04\nbeta");
		expect(task).toContain('<input id="#0-1">');
	});
});

describe("batch answers", () => {
	const inputs = [
		input(record(0, "a"), record(1, "b")),
		{
			range: { start: 2, level: 1 },
			children: [record(2, "c"), record(3, "d")],
		},
	];

	it("reads one line for each requested range", () => {
		const parsed = parseBatchAnswer("#0-1: one\n#2-3: two", inputs);
		expect(parsed.get("#0-1")).toBe("one");
		expect(parsed.get("#2-3")).toBe("two");
	});

	it("keeps the good lines of an answer with a malformed and an unknown line", () => {
		const parsed = parseBatchAnswer(
			"Here are the lines.\n#9-9: elsewhere\n#0-1 one\n#2-3: two",
			inputs,
		);
		expect([...parsed]).toEqual([["#2-3", "two"]]);
	});

	it("keeps a reported range absent from a short answer", () => {
		expect(parseBatchAnswer("#0-1: one", inputs).get("#2-3")).toBeUndefined();
	});

	it("keeps a repeated address unresolved", () => {
		const parsed = parseBatchAnswer(
			"#0-1: one\n#0-1: again\n#2-3: two",
			inputs,
		);
		expect(parsed.has("#0-1")).toBe(false);
		expect(parsed.get("#2-3")).toBe("two");
	});
});

describe("job answers", () => {
	it("accepts an answer with no shrink check, unlike a model merge", () => {
		const short = input(record(0, "ab"), record(1, "cd"));
		const line = answerLine(short, "abcde");
		expect(line).toEqual({
			ok: true,
			summary: "abcde",
			chars: 5,
			truncated: false,
			ts_from: "2026-11-01",
			ts_to: "2026-11-02",
		});
	});

	it("trims the answer and fails on an empty answer", () => {
		expect(answerLine(input(record(0, "a"), record(1, "b")), " text ").ok).toBe(
			true,
		);
		expect(answerLine(input(record(0, "a"), record(1, "b")), "  ")).toEqual({
			ok: false,
			reason: "no_answer",
		});
	});

	it("cuts an answer above the node limit and marks it truncated", () => {
		const line = answerLine(
			input(record(0, "a"), record(1, "b")),
			`${"word ".repeat(200)}`,
		);
		expect(line.ok).toBe(true);
		if (line.ok) {
			expect(line.chars).toBeLessThanOrEqual(640);
			expect(line.truncated).toBe(true);
		}
	});

	it("gives the copy line of one input with a single non-empty child", () => {
		const line = copyBuild(input(record(2, "only note"), null));
		expect(line).toEqual({
			ok: true,
			summary: "only note",
			chars: 9,
			truncated: false,
			ts_from: "2026-11-03",
			ts_to: "2026-11-03",
		});
	});

	it("joins two whole texts with the dates of the two children", () => {
		const line = joinBuild(input(record(0, "first"), record(1, "second")));
		expect(line).toEqual({
			ok: true,
			summary: "first; second",
			chars: 13,
			truncated: false,
			ts_from: "2026-11-01",
			ts_to: "2026-11-02",
		});
	});

	it("accepts a pair that exactly fills the node limit", () => {
		const line = joinBuild(
			input(record(0, "a".repeat(320)), record(1, "b".repeat(318))),
		);
		expect(line?.summary).toHaveLength(640);
		expect(line?.chars).toBe(640);
		expect(line?.truncated).toBe(false);
	});

	it("rejects a pair above the limit and an input with one child", () => {
		expect(
			joinBuild(input(record(0, "a".repeat(320)), record(1, "b".repeat(319)))),
		).toBeNull();
		expect(joinBuild(input(record(0, "only"), null))).toBeNull();
	});
});

describe("pacing", () => {
	it("gives the waits ten, sixty, then three hundred", () => {
		expect(retryDelay(1)).toBe(10);
		expect(retryDelay(2)).toBe(60);
		expect(retryDelay(3)).toBe(300);
		expect(retryDelay(7)).toBe(300);
	});

	it("defers a call at the hourly limit and frees it after the hour", () => {
		const window = new RateWindow(2);
		expect(window.tryAcquire(1000)).toBe(true);
		expect(window.tryAcquire(2000)).toBe(true);
		expect(window.tryAcquire(3000)).toBe(false);
		expect(window.tryAcquire(3_700_000)).toBe(true);
	});

	it("keeps the calls of the hour when the limit changes", () => {
		const window = new RateWindow(3);
		expect(window.tryAcquire(1000)).toBe(true);
		expect(window.tryAcquire(2000)).toBe(true);
		window.setLimit(2);
		expect(window.max).toBe(2);
		expect(window.tryAcquire(3000)).toBe(false);
		window.setLimit(4);
		expect(window.tryAcquire(3000)).toBe(true);
		expect(window.tryAcquire(4000)).toBe(true);
		expect(window.tryAcquire(5000)).toBe(false);
		expect(window.tryAcquire(3_700_000)).toBe(true);
	});
});

describe("compactionPass", () => {
	const stores: Store[] = [];
	const dirs: string[] = [];
	afterAll(() => {
		for (const store of stores) store.close();
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});
	function open(): Store {
		const dir = mkdtempSync(join(tmpdir(), "memlens-compaction-"));
		dirs.push(dir);
		const store = new Store(dir);
		stores.push(store);
		return store;
	}
	function add(store: Store, body: string, index: number): void {
		note(store, {
			scope: "p:x",
			kind: "note",
			body,
			session: "s",
			turn: "t",
			preset: "p",
			ts: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
		});
	}
	it("publishes join nodes bottom up without a model", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `note ${i}`, i);
		const model = async (): Promise<string> => {
			throw new Error("unexpected model");
		};
		expect(await compactionPass(store, "p:x", model)).toMatchObject({
			built: 2,
			calls: 0,
		});
		expect(await compactionPass(store, "p:x", model)).toMatchObject({
			built: 1,
			calls: 0,
		});
		expect(await compactionPass(store, "p:x", model)).toMatchObject({
			built: 0,
			calls: 0,
		});
		expect(sliceOf(loadView(store.handle(), "p:x"), 3)[0]).toMatchObject({
			kind: "summary",
			summary: "note 0; note 1",
		});
	});
	it("gives each child of a merge its own date span", async () => {
		const store = open();
		for (const index of [0, 1, 4, 5])
			add(store, `${"long body ".repeat(30)}${index}`, index);
		expect(
			await compactionPass(store, "p:x", async () => {
				throw new Error("unexpected model");
			}),
		).toMatchObject({ built: 2, calls: 0 });
		const tasks: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			tasks.push(task);
			return "#0-3: summary";
		});
		expect(result).toMatchObject({ built: 1, calls: 1 });
		expect(tasks[0]).toContain("#0-1 2026-01-01..02");
		expect(tasks[0]).toContain("#2-3 2026-01-05..06");
		expect(tasks[0]).not.toContain("#0-1 2026-01-01..06");
	});
	it("sends complete longforms to the batch model, including a single child", async () => {
		for (const count of [1, 2]) {
			const store = open();
			const documents = Array.from(
				{ length: count },
				(_, i) => `${String(i).repeat(16370)}-END-${i}`,
			);
			for (let i = 0; i < count; i++) {
				note(store, {
					scope: "p:x",
					kind: "note",
					body: `body ${i}`,
					longform: documents[i],
					session: "s",
					turn: "t",
					preset: "p",
					ts: `2026-01-0${i + 1}T00:00:00.000Z`,
				});
			}
			const calls: string[] = [];
			const result = await compactionPass(
				store,
				"p:x",
				async (_system, task) => {
					calls.push(task);
					return "#0-1: summary";
				},
			);
			expect(result).toMatchObject({ built: 1, failed: 0 });
			expect(calls).toHaveLength(1);
			for (const document of documents) expect(calls[0]).toContain(document);
		}
	});
	it("sends even short longforms to the model", async () => {
		const store = open();
		for (let i = 0; i < 2; i++)
			note(store, {
				scope: "p:x",
				kind: "note",
				body: `body ${i}`,
				longform: `document ${i}`,
				session: "s",
				turn: "t",
				preset: "p",
				ts: `2026-01-0${i + 1}T00:00:00.000Z`,
			});
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return "#0-1: summary";
		});
		expect(result).toMatchObject({ built: 1, calls: 1 });
		expect(calls[0]).toContain("document 0");
		expect(calls[0]).toContain("document 1");
	});
	it("publishes batch answers", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		expect(
			await compactionPass(store, "p:x", async (system) => {
				expect(system).toContain(OUTPUT_MANY);
				return "#0-1: first summary\n#2-3: second summary";
			}),
		).toMatchObject({ built: 2, calls: 1, failed: 0 });
	});
	it("takes ten inputs by default", async () => {
		const store = open();
		for (let i = 0; i < 22; i++)
			add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return Array.from(
				{ length: 10 },
				(_, i) => `#${i * 2}-${i * 2 + 1}: summary`,
			).join("\n");
		});
		expect(result).toMatchObject({ built: 10, calls: 1, failed: 0 });
		expect(calls[0]?.match(/<input id=/g)).toHaveLength(10);
	});
	it("keeps the good lines of an answer with a broken line and an unknown address", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return calls.length === 1
				? "Thinking.\n#9-9: elsewhere\n#0-1 one\n#0-1: first summary"
				: "#2-3: second summary";
		});
		expect(result).toMatchObject({ built: 2, calls: 2, failed: 0 });
		expect(calls[1]).toContain('<input id="#2-3">');
		expect(calls[1]).not.toContain('<input id="#0-1">');
	});
	it("publishes the other lines of an answer that repeats one range", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return calls.length === 1
				? "#0-1: one\n#0-1: again\n#2-3: second summary"
				: "#0-1: first summary";
		});
		expect(result).toMatchObject({ built: 2, calls: 2, failed: 0 });
	});
	it("asks again for a range whose line was too long", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return calls.length === 1
				? `#0-1: first summary\n#2-3: ${"x".repeat(1000)}`
				: "#2-3: second summary";
		});
		expect(result).toMatchObject({ built: 2, calls: 2, failed: 0 });
	});
	it("records the last reason of a range that never builds", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			calls.push(task);
			return calls.length === 1
				? `#0-1: first summary\n#2-3: ${"x".repeat(1000)}`
				: `#2-3: ${"y".repeat(1000)}`;
		});
		expect(result).toMatchObject({ built: 1, calls: 2, failed: 1 });
		expect(result.failures).toEqual(["not_shorter"]);
		expect(loadView(store.handle(), "p:x").nodes).toHaveLength(1);
	});
	it("halves a malformed batch down to one input and leaves it dirty", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const result = await compactionPass(
			store,
			"p:x",
			async () => "bad response",
		);
		expect(result).toMatchObject({
			built: 0,
			failed: 2,
			calls: 3,
			failures: ["invalid_batch", "invalid_batch"],
		});
		expect(loadView(store.handle(), "p:x").nodes).toHaveLength(0);
	});
	it("halves a rejected call down to one input and keeps it dirty", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const result = await compactionPass(store, "p:x", async () => {
			throw new Error("provider down");
		});
		expect(result).toMatchObject({
			built: 0,
			failed: 2,
			calls: 3,
			failures: ["no_answer", "no_answer"],
		});
	});
	it("halves a rejected batch of four and publishes every range once", async () => {
		const store = open();
		for (let i = 0; i < 8; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		const tasks: string[] = [];
		let first = true;
		const result = await compactionPass(store, "p:x", async (_system, task) => {
			tasks.push(task);
			if (first) {
				first = false;
				throw new Error("provider rejected the batch");
			}
			const ids = [...task.matchAll(/<input id="(#\d+-\d+)">/g)].map(
				(match) => match[1] ?? "",
			);
			return ids.map((id) => `${id}: summary`).join("\n");
		});
		expect(result).toMatchObject({ built: 4, calls: 3, failed: 0 });
		expect(tasks.map((task) => task.match(/<input id=/g)?.length)).toEqual([
			4, 2, 2,
		]);
		const asked = tasks
			.slice(1)
			.flatMap((task) =>
				[...task.matchAll(/<input id="(#\d+-\d+)">/g)].map(
					(match) => match[1] ?? "",
				),
			);
		expect(new Set(asked).size).toBe(4);
		expect(loadView(store.handle(), "p:x").nodes).toHaveLength(4);
	});
	it("takes a batch above ten in one call", async () => {
		const store = open();
		for (let i = 0; i < 60; i++)
			add(store, `${"long body ".repeat(40)}${i}`, i);
		const calls: string[] = [];
		const result = await compactionPass(
			store,
			"p:x",
			async (_system, task) => {
				calls.push(task);
				const ids = [...task.matchAll(/<input id="(#\d+-\d+)">/g)].map(
					(match) => match[1] ?? "",
				);
				return ids.map((id) => `${id}: summary`).join("\n");
			},
			{ batch: 25 },
		);
		expect(result).toMatchObject({ built: 25, calls: 1, failed: 0 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.match(/<input id=/g)).toHaveLength(25);
	});
	it("rejects invalid batch sizes", async () => {
		const store = open();
		for (const batch of [0, 1.5, -4])
			await expect(
				compactionPass(store, "p:x", async () => "", { batch }),
			).rejects.toThrow(RangeError);
	});
	it("states the reason of each failed merge answer", async () => {
		const store = open();
		add(store, `${"long body ".repeat(40)}0`, 0);
		add(store, `${"long body ".repeat(40)}1`, 1);
		const result = await compactionPass(
			store,
			"p:x",
			async () => `#0-1: ${"x".repeat(1000)}`,
		);
		expect(result).toMatchObject({ failed: 1, built: 0 });
		expect(result.failures).toEqual(["not_shorter"]);
	});
	it("rejects a model answer after a child changes", async () => {
		const store = open();
		add(store, "a".repeat(400), 0);
		add(store, "b".repeat(400), 1);
		const id = loadView(store.handle(), "p:x").notes[0]?.id;
		if (!id) throw new Error("missing note");
		const result = await compactionPass(store, "p:x", async () => {
			amend(store, { id, body: "changed" });
			return "#0-1: summary";
		});
		expect(result).toMatchObject({ rejected: 1, built: 0, calls: 1 });
		expect(loadView(store.handle(), "p:x").nodes).toHaveLength(0);
	});
});

describe("publishRound", () => {
	const stores: Store[] = [];
	const dirs: string[] = [];
	afterAll(() => {
		for (const store of stores) store.close();
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});
	function open(): Store {
		const dir = mkdtempSync(join(tmpdir(), "memlens-round-"));
		dirs.push(dir);
		const store = new Store(dir);
		stores.push(store);
		return store;
	}
	function add(store: Store, body: string, index: number) {
		const result = note(store, {
			scope: "p:x",
			kind: "note",
			body,
			session: "s",
			turn: "t",
			preset: "p",
			ts: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
		});
		if (!result.ok) throw new Error(result.reason);
		return result.value;
	}
	it("publishes a join chain from one view per round", () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `note ${i}`, i);
		const first = publishRound(store, "p:x");
		expect(first).toMatchObject({ published: 2, joined: 2 });
		expect(first.pending).toHaveLength(2);
		expect(first.pending[0]?.range).toEqual({ start: 0, level: 1 });
		expect(first.pending[0]?.input.children).toMatchObject([
			{ kind: "record", pos: 0, body: "note 0", preview: "" },
			{ kind: "record", pos: 1, body: "note 1", preview: "" },
		]);
		const second = publishRound(store, "p:x");
		expect(second).toMatchObject({ published: 1, joined: 1 });
		expect(second.pending).toHaveLength(1);
		const third = publishRound(store, "p:x");
		expect(third).toMatchObject({ published: 0, joined: 0 });
		expect(third.pending).toEqual([]);
		expect(candidates(store, "p:x")).toEqual([]);
	});
	it("publishes a copy for one live half", () => {
		const store = open();
		add(store, "kept", 0);
		const drop = add(store, "hidden", 1);
		hide(store, drop.id);
		const round = publishRound(store, "p:x");
		expect(round).toMatchObject({ published: 1, joined: 0 });
		expect(round.pending).toHaveLength(1);
		expect(candidates(store, "p:x")).toEqual([]);
		expect(
			store.handle().prepare("SELECT summary FROM nodes").get()?.summary,
		).toBe("kept");
	});
	it("holds an oversized pair as a merge input", () => {
		const store = open();
		add(store, "a".repeat(400), 0);
		add(store, "b".repeat(400), 1);
		const round = publishRound(store, "p:x");
		expect(round).toMatchObject({ published: 0, joined: 0 });
		expect(round.pending).toHaveLength(1);
		expect(round.pending[0]?.read.fits).toBe(false);
	});
	it("runs one publish and no read per round of a whole compaction", () => {
		const store = open();
		for (let i = 0; i < 64; i++) add(store, `note ${i}`, i);
		let reads = 0;
		let publishes = 0;
		const read = store.read.bind(store);
		const publish = store.publish.bind(store);
		store.read = ((work) => {
			reads += 1;
			return read(work);
		}) as typeof store.read;
		store.publish = ((work) => {
			publishes += 1;
			return publish(work);
		}) as typeof store.publish;
		let rounds = 0;
		for (;;) {
			rounds += 1;
			if (!publishRound(store, "p:x").published) break;
		}
		// Six levels of 64 notes publish, then one empty round ends the loop.
		expect(rounds).toBe(7);
		expect(publishes).toBe(7);
		expect(reads).toBe(0);
	});
});
