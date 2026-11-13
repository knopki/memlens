/**
 * #region moduleContract
 * @purpose Check merge attempts, batch answers, job answers, form choice, pacing, and one compaction pass.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	answerLine,
	autoForm,
	batchTask,
	childLine,
	compactionPass,
	copyBuild,
	joinBuild,
	mergeLine,
	mergeTask,
	parseBatchAnswer,
	RateWindow,
	retryDelay,
} from "../src/domain/compaction.js";
import { amend, note } from "../src/store/notes.js";
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
const model = (answers: string[]) => {
	const calls: string[] = [];
	return {
		calls,
		model: async (_system: string, task: string) => {
			calls.push(task);
			const answer = answers.shift();
			if (answer === undefined) throw new Error("No answer left");
			return answer;
		},
	};
};

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

	it("fills the merge task text with the target and the words", () => {
		const task = mergeTask(512, record(0, "a"), record(1, "b"));
		expect(task).toContain("at most 512 characters (about 85 words)");
		expect(task).not.toContain("---");
		expect(task).toContain(
			"<input>\n#0 2026-11-01\na\n#1 2026-11-02\nb\n</input>",
		);
	});

	it("asks one batch call for each input block", () => {
		const task = batchTask(512, [input(record(0, "a"), record(1, "b"))]);
		expect(task).toContain('"#a-b: line"');
		expect(task).toContain('<input id="#0-1">');
		expect(task).toContain("</input>");
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

describe("mergeLine", () => {
	it("copies one non-empty child without a model call", async () => {
		const line = await mergeLine(
			input(record(2, "only note"), null),
			async () => {
				throw new Error("The model must not run");
			},
		);
		expect(line).toEqual({
			ok: true,
			summary: "only note",
			chars: 9,
			truncated: false,
			ts_from: "2026-11-03",
			ts_to: "2026-11-03",
		});
	});

	it("accepts a short answer with no retry", async () => {
		const stub = model(["short answer"]);
		const line = await mergeLine(
			input(record(0, "a long body"), record(1, "b long body")),
			stub.model,
		);
		expect(stub.calls).toHaveLength(1);
		expect(line).toMatchObject({
			ok: true,
			summary: "short answer",
			truncated: false,
		});
	});

	it("retries an over-long answer with 0.75 of the target", async () => {
		const stub = model(["x".repeat(700), "short answer"]);
		const line = await mergeLine(
			input(record(0, "a".repeat(300)), record(1, "b".repeat(300))),
			stub.model,
		);
		expect(stub.calls).toHaveLength(2);
		expect(stub.calls[1]).toContain("at most 384 characters");
		expect(stub.calls[0]).toContain("at most 512 characters");
		expect(line).toMatchObject({ ok: true, summary: "short answer" });
	});

	it("takes the shortest attempt and cuts it at a word boundary", async () => {
		const long = `${"word ".repeat(140)}end`;
		const stub = model([long, `${long} much longer still`, long]);
		const line = await mergeLine(
			input(record(0, "a".repeat(400)), record(1, "b".repeat(400))),
			stub.model,
		);
		expect(stub.calls).toHaveLength(3);
		if (!line.ok) throw new Error("The line must build");
		expect(line.truncated).toBe(true);
		expect(line.chars).toBeLessThanOrEqual(640);
		expect(line.summary.endsWith("word")).toBe(true);
	});

	it("leaves the node dirty when no answer is shorter than its source", async () => {
		const stub = model(["x".repeat(700), "y".repeat(700), "z".repeat(700)]);
		const line = await mergeLine(
			input(record(0, "a".repeat(300)), record(1, "b".repeat(300))),
			stub.model,
		);
		expect(stub.calls).toHaveLength(3);
		expect(line).toEqual({ ok: false, reason: "not_shorter" });
	});

	it("fails with no answer when each call breaks", async () => {
		const line = await mergeLine(
			input(record(0, "body a"), record(1, "body b")),
			async () => {
				throw new Error("provider down");
			},
		);
		expect(line).toEqual({ ok: false, reason: "no_answer" });
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
		expect(parsed?.get("#0-1")).toBe("one");
		expect(parsed?.get("#2-3")).toBe("two");
	});

	it("rejects a missing range, an unknown address, and a malformed line", () => {
		expect(parseBatchAnswer("#0-1: one", inputs)).toBeNull();
		expect(parseBatchAnswer("#0-1: one\n#9-9: two", inputs)).toBeNull();
		expect(parseBatchAnswer("#0-1 one\n#2-3: two", inputs)).toBeNull();
		expect(parseBatchAnswer("#0-1: one\n#0-1: again", inputs)).toBeNull();
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

describe("form choice and pacing", () => {
	it("picks parallel for a model under a specific cache glob", () => {
		const cacheTtl = { "deepseek/*": 7200, "anthropic/*": 300, "*": 3600 };
		expect(autoForm("deepseek-chat", cacheTtl)).toBe("parallel");
		expect(autoForm("gpt-5", cacheTtl)).toBe("batch");
		expect(autoForm("gpt-5", {})).toBe("batch");
		expect(autoForm("anthropic/opus", cacheTtl)).toBe("parallel");
	});

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
			ts: `2026-01-0${index + 1}T00:00:00.000Z`,
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
	it("publishes batch answers", async () => {
		const store = open();
		for (let i = 0; i < 4; i++) add(store, `${"long body ".repeat(40)}${i}`, i);
		expect(
			await compactionPass(
				store,
				"p:x",
				async () => "#0-1: first summary\n#2-3: second summary",
				{ form: "batch" },
			),
		).toMatchObject({ built: 2, calls: 1, failed: 0 });
	});
	it("rejects a model answer after a child changes", async () => {
		const store = open();
		add(store, "a".repeat(400), 0);
		add(store, "b".repeat(400), 1);
		const id = loadView(store.handle(), "p:x").notes[0]?.id;
		if (!id) throw new Error("missing note");
		const result = await compactionPass(store, "p:x", async () => {
			amend(store, { id, body: "changed" });
			return "summary";
		});
		expect(result).toMatchObject({ rejected: 1, built: 0, calls: 1 });
		expect(loadView(store.handle(), "p:x").nodes).toHaveLength(0);
	});
});
