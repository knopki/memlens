/**
 * #region moduleContract
 * @purpose Check merge attempts, batch answers, form choice, pacing, and one writer pass.
 * #endregion moduleContract
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scopeTree } from "../src/domain/projection.js";
import { slice } from "../src/domain/tree.js";
import {
	autoForm,
	batchTask,
	childLine,
	mergeLine,
	mergeTask,
	parseBatchAnswer,
	RateWindow,
	retryDelay,
	writerPass,
} from "../src/domain/writer.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { AppendEvent } from "../src/types/store.js";
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
		).toBe("#0-3 2026-11-01..2026-11-02\nsum");
	});

	it("fills the merge task text with the target, words, and ruler", () => {
		const task = mergeTask(512, record(0, "a"), record(1, "b"));
		expect(task).toContain("at most 512 characters (about 85 words)");
		expect(task).toContain(`${"-".repeat(512)}`);
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
		expect(stub.calls[1]).toContain("-".repeat(384));
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

describe("writerPass", () => {
	const directories: string[] = [];
	afterEach(async () => {
		await Promise.all(directories.map((dir) => rm(dir, { recursive: true })));
		directories.length = 0;
	});

	const note = (body: string): Extract<AppendEvent, { op: "note" }> => ({
		op: "note",
		scope: "project:a",
		body,
		kind: "note",
		ts: "2026-11-10T00:00:00.000Z",
		review_at: null,
		session: "s",
		turn: "t",
		preset: "p",
	});

	it("builds dirty nodes bottom-up and repeats to the root", async () => {
		const directory = await mkdtemp(join(tmpdir(), "memlens-writer-"));
		directories.push(directory);
		const store = new SqliteStore(directory);
		for (let index = 0; index < 4; index += 1)
			await store.append(note(`note ${index}`));
		const summary = async () => "sum";
		const pass = async () =>
			writerPass(
				store,
				"project:a",
				scopeTree(await store.projection(), "project:a"),
				summary,
				{ form: "parallel" },
			);
		expect(await pass()).toMatchObject({ built: 2, rejected: 0, failed: 0 });
		expect(await pass()).toMatchObject({ built: 1, rejected: 0, failed: 0 });
		expect(await pass()).toMatchObject({ built: 0, calls: 0 });
		const lines = slice(scopeTree(await store.projection(), "project:a"), 3);
		expect(lines).toHaveLength(3);
		expect(lines[0]).toMatchObject({ kind: "summary", summary: "sum" });
		await store.close();
	});

	it("makes one batch call for several lines and publishes each result", async () => {
		const directory = await mkdtemp(join(tmpdir(), "memlens-writer-"));
		directories.push(directory);
		const store = new SqliteStore(directory);
		for (let index = 0; index < 4; index += 1)
			await store.append(note(`${"long body ".repeat(10)}${index}`));
		const batch = async () => "#0-1: sum zero one\n#2-3: sum two three";
		const result = await writerPass(
			store,
			"project:a",
			scopeTree(await store.projection(), "project:a"),
			batch,
			{ form: "batch" },
		);
		expect(result).toMatchObject({
			built: 2,
			calls: 1,
			rejected: 0,
			failed: 0,
		});
		await store.close();
	});
});
