/**
 * #region moduleContract
 * @purpose Prove the memory tools of one agent, with the real tool service and the real store.
 * @scope
 *  - The tool set of the main agent and of the three subagent modes.
 *  - Each tool answer against its declared shape, the profile checks, the proposals, and the parent report.
 * @invariants Each call goes through the real tool registration of the agent scope.
 * @invariants Each answer passes the output schema of its tool.
 * @dependencies USES API: @deepseek-ai/cordis, @deepseek-ai/dsh-scope, @deepseek-ai/dsh-system-prompt, @deepseek-ai/dsh-tools, @memlens/core
 * @keywords test, memlens, tools, subagent, proposal, scope, map, review
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
import { createScope, type Scope, type ScopeKey } from "@deepseek-ai/dsh-scope";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import {
	type ToolDefinition,
	ToolsService,
	validateJsonSchemaValue,
} from "@deepseek-ai/dsh-tools";
import {
	dayOf,
	directionsData,
	FIND_DEFAULT_LIMIT,
	hide,
	LONGFORM_HEAD,
	liveCounts,
	loadView,
	type Note,
	note,
	nowIso,
	pending,
	type ResolvedConfig,
	redact,
	sliceOf,
	textOfLine,
	topLineOf,
	visibleScopes,
} from "@memlens/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerMemoryTools } from "../src/memory-tools.js";
import { Memlens } from "../src/service.js";

const BASE_CONFIG = `language = "en"
defaultProfile = "all"

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"

[profile.all]
scopes = ["*"]
[profile.all.budget]
here = 20
directions = 10

[profile.tight]
scopes = ["*"]
[profile.tight.budget]
here = 20
directions = 1

[profile.narrow]
scopes = ["project:memlens"]
[profile.narrow.budget]
here = 20
directions = 1

[profile.propose]
scopes = ["*"]
subagents = "propose"
[profile.propose.budget]
here = 20
directions = 10

[profile.reader]
scopes = ["*"]
subagents = "read"
[profile.reader.budget]
here = 20
directions = 10

[profile.off]
scopes = ["*"]
subagents = "off"
[profile.off.budget]
here = 20
directions = 10

[scope_default]
default = "user:notes"
rules = [{ match = "path", glob = "*", key = "user:notes" }]
`;

const savedEnv = { ...process.env };

let rootDir: string;

let cwd: string;

let root: Context;

let host: Memlens;

/** One agent with its scope and memory inputs. */
interface Subject {
	readonly agent: Agent;
	readonly scope: Scope;
	readonly key: ScopeKey;
	readonly config: ResolvedConfig;
}

/** A parent that records the injected context. */
interface Parent {
	readonly id: string;
	readonly injected: UserMessage[];
	inject(message: UserMessage): void;
}

/** Wait until the real tool and prompt services of the context are active. */
async function settle(): Promise<void> {
	for (let index = 0; index < 200; index += 1) {
		if (
			root.get("tools") !== undefined &&
			root.get("systemPrompt") !== undefined
		)
			return;
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
	}
	throw new Error("The tool and prompt services did not start.");
}

beforeEach(async () => {
	rootDir = mkdtempSync(join(tmpdir(), "memlens-tools-"));
	cwd = join(rootDir, "project");
	mkdirSync(cwd, { recursive: true });
	const configDir = join(rootDir, "config");
	mkdirSync(join(configDir, "memlens"), { recursive: true });
	writeFileSync(join(configDir, "memlens", "config.toml"), BASE_CONFIG);
	process.env.XDG_CONFIG_HOME = configDir;
	process.env.XDG_DATA_HOME = join(rootDir, "data");
	process.env.HOME = rootDir;
	delete process.env.MEMLENS_STORE;
	root = new Context();
	root.plugin(SystemPrompt, {});
	root.plugin(ToolsService, {});
	await settle();
	host = new Memlens(root, {});
});

afterEach(async () => {
	await root.fiber.dispose();
	process.env = { ...savedEnv };
	rmSync(rootDir, { recursive: true, force: true });
});

function key(name: string): ScopeKey {
	return { name };
}

/** Register one preset profile on its own scope. */
function preset(name: string, profile: string): ScopeKey {
	const presetKey = key(`preset-${name}`);
	const scope = createScope(root, presetKey);
	scope.ctx.memlens.registerPreset({ profile });
	return presetKey;
}

/** Make one agent with its own scope under one preset. */
function subject(
	name: string,
	profile: string,
	header: Record<string, unknown> = {},
): Subject {
	const agentKey = key(`agent-${name}`);
	const scope = createScope(root, agentKey, {
		parent: preset(name, profile),
	});
	const agent = {
		id: name,
		ctx: scope.ctx,
		session: { id: name, header: { cwd, ...header } },
	} as unknown as Agent;
	const memory = host.forAgent(agent);
	registerMemoryTools(agent, memory);
	return { agent, scope, key: agentKey, config: memory.config };
}

/** Give the store one note as a fixture. */
function seed(
	scopeName: string,
	body: string,
	reviewAt: string | null = null,
	ts?: string,
): Note {
	const saved = note(host.store, {
		scope: scopeName as `${string}:${string}`,
		body,
		kind: "note",
		review_at: reviewAt,
		...(ts === undefined ? {} : { ts }),
		session: "test",
		turn: "test",
		preset: "test",
	});
	if (!saved.ok) throw new Error(`The fixture note ${body} is a duplicate.`);
	return saved.value;
}

/** Read one tool of one agent scope, or throw when the agent has no such tool. */
function tool(subject: Subject, name: string): ToolDefinition {
	const definition = root.tools.get(name, subject.key);
	if (definition === undefined)
		throw new Error(`The agent has no tool ${name}.`);
	return definition;
}

/**
 * Call one tool through its registered definition and check its answer shape.
 * @returns The canonical answer of the tool.
 */
async function call(
	subject: Subject,
	name: string,
	args: unknown,
): Promise<unknown> {
	const definition = tool(subject, name);
	const value = await definition.execute(
		args,
		{} as Parameters<ToolDefinition["execute"]>[1],
	);
	expect(validateJsonSchemaValue(definition.output.schema, value)).toEqual([]);
	return value;
}

/** Read the model-facing text of one call answer. */
function render(
	subject: Subject,
	name: string,
	args: unknown,
	value: unknown,
): string {
	const definition = tool(subject, name);
	const content = definition.output.render(args, value as never);
	const first = content[0];
	return first?.type === "text" ? first.text : "";
}

/** List the tool names that one agent scope sees. */
function names(subject: Subject): string[] {
	return root.tools
		.definitions(subject.key)
		.map((definition) => definition.name)
		.sort();
}

describe("memory tools of one agent", () => {
	it("gives the main agent six tools", () => {
		const main = subject("main", "all");

		expect(names(main)).toEqual([
			"memory_find",
			"memory_forget",
			"memory_map",
			"memory_note",
			"memory_open",
			"memory_review",
		]);
	});

	it("gives a propose child four tools", () => {
		const child = subject("child", "propose", { origin: "subagent" });

		expect(names(child)).toEqual([
			"memory_find",
			"memory_map",
			"memory_note",
			"memory_open",
		]);
		expect(root.tools.get("memory_forget", child.key)).toBeUndefined();
		expect(root.tools.get("memory_review", child.key)).toBeUndefined();
	});

	it("gives a read child three tools", () => {
		const child = subject("child", "reader", { origin: "subagent" });

		expect(names(child)).toEqual(["memory_find", "memory_map", "memory_open"]);
	});

	it("gives an off child no tool", () => {
		const child = subject("child", "off", { origin: "subagent" });

		expect(names(child)).toEqual([]);
	});

	it("writes a note and gives its live answer", async () => {
		const main = subject("main", "all");

		const answer = (await call(main, "memory_note", {
			body: "The store keeps one row for each note.",
			kind: "fact",
			reviewIn: "30d",
		})) as { addr: string; id: string; state: string };

		expect(answer).toEqual({
			addr: expect.stringMatching(/^user:notes#\d+$/),
			id: expect.any(String),
			state: "live",
		});
		expect(render(main, "memory_note", {}, answer)).toBe(
			`saved ${answer.addr}`,
		);
		expect(
			await call(main, "memory_open", { target: answer.addr }),
		).toMatchObject({
			review_at: expect.any(String),
		});
		const never = (await call(main, "memory_note", {
			body: "The note without a review.",
			reviewIn: "never",
		})) as { addr: string };
		expect(render(main, "memory_note", {}, never)).toBe(`saved ${never.addr}`);
		expect(
			await call(main, "memory_open", { target: never.addr }),
		).toMatchObject({
			review_at: null,
		});
		expect(
			tool(main, "memory_note").presentResult?.(
				{},
				{
					content: [{ type: "text", text: "saved user:notes#0" }],
					isError: false,
				},
			),
		).toBeUndefined();
	});

	it("answers a duplicate write with the live note", async () => {
		const main = subject("main", "all");
		const input = {
			body: "One fact that the store holds once.",
			kind: "fact",
			reviewIn: "never",
		};

		const first = (await call(main, "memory_note", input)) as {
			addr: string;
			id: string;
			state: string;
		};
		const again = (await call(main, "memory_note", input)) as {
			addr: string;
			id: string;
			state: string;
		};

		expect(again).toEqual(first);
		expect(render(main, "memory_note", input, again)).toBe(
			`saved ${first.addr}`,
		);
	});

	it("writes a note of a past time before the newer notes", async () => {
		const main = subject("main", "all");
		const newer = (await call(main, "memory_note", {
			body: "A fact of the write time.",
		})) as { addr: string };

		expect(newer.addr).toBe("user:notes#0");
		const older = (await call(main, "memory_note", {
			body: "A fact of the past.",
			ts: "2026-01-02T03:04:05Z",
		})) as { addr: string };

		expect(older.addr).toBe("user:notes#0");
		expect(render(main, "memory_note", {}, older)).toBe(
			"saved user:notes#0\nmoved: notes #0..#0 of user:notes are now #1..#1. Re-read with memory_map, or find a note with memory_find.",
		);
		expect(
			await call(main, "memory_open", { target: older.addr }),
		).toMatchObject({
			body: "A fact of the past.",
			ts: dayOf("2026-01-02T03:04:05.000Z"),
		});
		expect(
			await call(main, "memory_open", { target: "user:notes#1" }),
		).toMatchObject({ body: "A fact of the write time." });
	});

	it("includes hidden and cleared tail slots in the moved range of only that scope", async () => {
		seed("user:notes", "January.", null, "2026-01-01T12:00:00Z");
		const hidden = seed("user:notes", "March.", null, "2026-03-01T12:00:00Z");
		const cleared = seed("user:notes", "April.", null, "2026-04-01T12:00:00Z");
		hide(host.store, hidden.id);
		redact(host.store, cleared.id, "test");
		for (let i = 0; i < 5; i++) seed("global:prefs", `Foreign ${i}.`);
		const main = subject("main", "all");
		const answer = await call(main, "memory_note", {
			body: "February.",
			ts: "2026-02-01T12:00:00Z",
		});
		expect(render(main, "memory_note", {}, answer)).toBe(
			"saved user:notes#1\nmoved: notes #1..#2 of user:notes are now #2..#3. Re-read with memory_map, or find a note with memory_find.",
		);
	});

	it("refuses a note time that is not a date", async () => {
		const main = subject("main", "all");

		await expect(
			call(main, "memory_note", { body: "A fact.", ts: "yesterday" }),
		).rejects.toThrow(/is not a date/);
		expect(pending(host.store)).toHaveLength(0);
	});

	it("finds the written note with its declared shape", async () => {
		seed("user:notes", "A decision about the cache.");
		const main = subject("main", "all");

		const answer = (await call(main, "memory_find", {
			query: "cache",
		})) as { hits: { addr: string; scope: string; body: string }[] };

		expect(answer.hits).toHaveLength(1);
		expect(answer.hits[0]?.scope).toBe("user:notes");
		expect(answer.hits[0]?.body).toBe("A decision about the cache.");
		expect(answer.hits[0]?.addr).toMatch(/^user:notes#\d+$/);
	});

	it("finds a note of the first hours of a day, and shows that day", async () => {
		const main = subject("main", "all");
		// The note is at 00:00 in Moscow, and the store keeps 21:00 of the day before in UTC.
		const saved = (await call(main, "memory_note", {
			body: "A note at midnight.",
			ts: "2025-05-03T00:00:00+03:00",
		})) as { addr: string };
		const day = dayOf("2025-05-02T21:00:00.000Z");
		const args = { query: "midnight", since: day, until: day };

		const answer = (await call(main, "memory_find", args)) as {
			hits: unknown[];
		};

		expect(answer.hits).toHaveLength(1);
		expect(render(main, "memory_find", args, answer)).toBe(
			`${saved.addr}  ${day}  note  A note at midnight.`,
		);
		const opened = (await call(main, "memory_open", {
			target: saved.addr,
		})) as { ts: string; review_at: string };
		expect(opened.ts).toBe(day);
		expect(render(main, "memory_open", {}, opened).split("\n")[0]).toBe(
			`${saved.addr}  ${day}  review ${opened.review_at}`,
		);
	});

	it("gives a short longform with no offset hint", async () => {
		const main = subject("main", "all");
		const saved = (await call(main, "memory_note", {
			body: "A short document.",
			longform: "x".repeat(100),
		})) as { addr: string };

		const opened = (await call(main, "memory_open", {
			target: saved.addr,
		})) as { longformChars: number };
		const text = render(main, "memory_open", {}, opened);

		expect(opened.longformChars).toBe(100);
		expect(text).toContain("--- longform 100 chars ---");
		expect(text).not.toContain("next offset");
	});

	it("gives the head of a long document and the next offset", async () => {
		const main = subject("main", "all");
		const saved = (await call(main, "memory_note", {
			body: "A long document.",
			longform: "y".repeat(5000),
		})) as { addr: string };

		const opened = (await call(main, "memory_open", {
			target: saved.addr,
		})) as { longform: string; longformOffset: number };
		const text = render(main, "memory_open", {}, opened);

		expect(opened.longform).toHaveLength(LONGFORM_HEAD);
		expect(opened.longformOffset).toBe(LONGFORM_HEAD);
		expect(text).toContain(
			`--- longform 5000 chars, next offset ${LONGFORM_HEAD} ---`,
		);
	});

	it("gives no longform section for a note without a document", async () => {
		const main = subject("main", "all");
		const saved = (await call(main, "memory_note", {
			body: "A plain note.",
		})) as { addr: string };

		const opened = (await call(main, "memory_open", {
			target: saved.addr,
		})) as { longformChars: number };

		expect(opened.longformChars).toBe(0);
		expect(render(main, "memory_open", {}, opened)).not.toContain("longform");
	});

	it("gives the model back the day that the model wrote", async () => {
		const main = subject("main", "all");

		for (const ts of ["2000-01-02", "2000-01-02T00:00:00"]) {
			const saved = (await call(main, "memory_note", {
				body: "A note of the day.",
				ts,
			})) as { addr: string };
			const opened = (await call(main, "memory_open", {
				target: saved.addr,
			})) as { ts: string };
			expect(opened.ts).toBe("2000-01-02");
		}
	});

	it("keeps the find limit", async () => {
		for (let index = 0; index < 3; index += 1)
			seed("user:notes", `The note number ${index}.`);
		const main = subject("main", "all");

		const answer = (await call(main, "memory_find", {
			query: "note",
			limit: 2,
		})) as { hits: unknown[] };

		expect(answer.hits).toHaveLength(2);
		expect(FIND_DEFAULT_LIMIT).toBe(10);
	});

	it("finds a kind that the newest rows of the scope hide", async () => {
		const main = subject("main", "all");
		const task = (await call(main, "memory_note", {
			body: "An old task about the deploy.",
			kind: "task",
			ts: "2020-01-01",
		})) as { addr: string };
		for (let index = 0; index < 60; index += 1)
			seed("user:notes", `A fresh note number ${index}.`);

		const byKind = (await call(main, "memory_find", {
			kinds: ["task"],
		})) as { hits: { addr: string }[] };
		const newest = (await call(main, "memory_find", { limit: 1 })) as {
			hits: { addr: string }[];
		};

		// The kind filter cuts the rows before the limit, so the oldest note comes first.
		expect(byKind.hits.map((hit) => hit.addr)).toEqual([task.addr]);
		expect(newest.hits[0]?.addr).not.toBe(task.addr);
	});

	it("opens a record by pos, by address, and by range", async () => {
		const record = seed("user:notes", "The active scope record.");
		const main = subject("main", "all");

		const byPos = (await call(main, "memory_open", {
			target: record.pos,
		})) as { kind: string; addr: string; body: string };
		const byAddress = (await call(main, "memory_open", {
			target: `user:notes#${record.pos}`,
		})) as { kind: string; addr: string };
		const byHash = (await call(main, "memory_open", {
			target: `#${record.pos}`,
		})) as { kind: string; addr: string };

		expect(byPos.kind).toBe("entry");
		expect(byPos.addr).toBe(`user:notes#${record.pos}`);
		expect(byPos.body).toBe("The active scope record.");
		expect(byAddress.addr).toBe(byPos.addr);
		expect(byHash.addr).toBe(byPos.addr);
	});

	it("opens a range as its children", async () => {
		seed("user:notes", "The first record.", null, "2026-01-01T00:00:00.000Z");
		seed("user:notes", "The second record.", null, "2026-01-02T00:00:00.000Z");
		const main = subject("main", "all");

		const answer = (await call(main, "memory_open", {
			target: "0-1",
		})) as { kind: string; children: { addr: string; text: string }[] };

		expect(answer.kind).toBe("children");
		expect(answer.children.map((line) => line.text)).toEqual([
			"The first record.",
			"The second record.",
		]);
	});

	it("gives the text of a range without a node", async () => {
		seed("user:notes", "The first record.", null, "2026-01-01T00:00:00.000Z");
		seed("user:notes", "The second record.", null, "2026-01-02T00:00:00.000Z");
		seed("user:notes", "The third record.", null, "2026-01-03T00:00:00.000Z");
		const main = subject("main", "all");

		const answer = (await call(main, "memory_open", {
			target: "0-3",
		})) as {
			kind: string;
			children: {
				addr: string;
				ts_from: string;
				ts_to: string;
				text: string;
				built: boolean;
			}[];
		};

		expect(answer.kind).toBe("children");
		expect(answer.children.map((line) => line.text)).toEqual([
			"The first record.; The second record.",
			"The third record.",
		]);
		expect(answer.children.map((line) => line.built)).toEqual([false, false]);
		expect(answer.children.map((line) => line.ts_from)).toEqual([
			"2026-01-01",
			"2026-01-03",
		]);
		expect(answer.children.map((line) => line.ts_to)).toEqual([
			"2026-01-02",
			"2026-01-03",
		]);
		const text = render(main, "memory_open", { target: "0-3" }, answer);
		expect(text).toContain("The first record.; The second record.");
		expect(text).not.toContain("(no summary yet)");
	});

	it("maps each scope with its newest day and its summary", async () => {
		seed("user:notes", "The note of the active scope.");
		seed("project:memlens", "The note of the project scope.");
		const main = subject("main", "tight");
		const scopes = visibleScopes(main.config.profile.scopes, [
			...liveCounts(host.store).keys(),
		]);
		const data = directionsData(
			host.store,
			scopes,
			main.config.budget.directions,
		);
		const tops = data.lines.map((line) => ({
			scope: line.scope,
			newestTs: line.newestTs,
			summary: textOfLine(
				topLineOf(loadView(host.store.handle(), line.scope)) as never,
			),
		}));

		const answer = (await call(main, "memory_map", {})) as {
			kind: string;
			lines: { keys: string[]; ts_from: string; ts_to: string; text: string }[];
		};

		expect(answer.kind).toBe("scopes");
		expect(answer.lines[0]?.keys).toEqual(data.rest);
		expect(answer.lines.slice(1).map((line) => line.keys[0])).toEqual(
			data.lines.map((line) => line.scope),
		);
		expect(answer.lines.slice(1).map((line) => line.ts_to)).toEqual(
			data.lines.map((line) => dayOf(line.newestTs)),
		);
		expect(answer.lines.slice(1).map((line) => line.text)).toEqual(
			tops.map((line) => line.summary),
		);
	});

	it("maps the frontier of one scope as the here block", async () => {
		seed("user:notes", "The frontier record.");
		const main = subject("main", "all");
		const slice = sliceOf(
			loadView(host.store.handle(), "user:notes"),
			main.config.budget.here,
		);

		const answer = (await call(main, "memory_map", {
			scope: "user:notes",
		})) as {
			kind: string;
			scope: string;
			lines: { addr: string; text: string }[];
		};

		expect(answer.kind).toBe("scope");
		expect(answer.scope).toBe("user:notes");
		expect(answer.lines.map((line) => line.addr)).toEqual(
			slice.map((line) =>
				line.kind === "record"
					? `user:notes#${line.pos}`
					: `user:notes#${line.range.start}-${line.range.start + 2 ** line.range.level - 1}`,
			),
		);
		expect(answer.lines.map((line) => line.text)).toEqual(
			slice.map((line) => textOfLine(line)),
		);
	});

	it("gives the text of a map line without a summary", async () => {
		for (let pos = 0; pos < 21; pos += 1) {
			const day = String(pos + 1).padStart(2, "0");
			seed(
				"user:notes",
				`Record ${pos}.`,
				null,
				`2026-01-${day}T00:00:00.000Z`,
			);
		}
		const main = subject("main", "all");

		const answer = (await call(main, "memory_map", {
			scope: "user:notes",
		})) as {
			lines: { addr: string; text: string; built: boolean }[];
		};

		expect(answer.lines).toHaveLength(20);
		expect(answer.lines[0]?.addr).toBe("user:notes#0-1");
		expect(answer.lines[0]?.text).toBe("Record 0.; Record 1.");
		expect(answer.lines[0]?.built).toBe(false);
		const text = render(main, "memory_map", { scope: "user:notes" }, answer);
		expect(text).toContain("Record 0.; Record 1.");
		expect(text).not.toContain("(no summary yet)");
	});

	it("refuses a foreign scope on each read tool", async () => {
		const record = seed("global:prefs", "The hidden scope record.");
		const narrow = subject("narrow", "narrow");

		await expect(
			call(narrow, "memory_find", {
				query: "record",
				scopes: ["global:prefs"],
			}),
		).rejects.toThrow(/not visible/);
		await expect(
			call(narrow, "memory_open", { target: `global:prefs#${record.pos}` }),
		).rejects.toThrow(/not visible/);
		await expect(
			call(narrow, "memory_map", { scope: "global:prefs" }),
		).rejects.toThrow(/not visible/);
		await expect(
			call(narrow, "memory_review", { scope: "global:prefs" }),
		).rejects.toThrow(/not visible/);
	});

	it("joins the active scope into a profile that lists it not", async () => {
		const narrow = subject("narrow", "narrow");

		const answer = (await call(narrow, "memory_note", {
			body: "The note of the session scope.",
		})) as { addr: string; state: string };

		expect(answer.addr).toMatch(/^user:notes#/);
		expect(answer.state).toBe("live");
		expect(pending(host.store)).toHaveLength(0);
		const map = (await call(narrow, "memory_map", {})) as {
			lines: { keys: string[] }[];
		};
		expect(map.lines.some((line) => line.keys.includes("user:notes"))).toBe(
			true,
		);
	});

	it("hides a record and echoes its address, day, kind, and body", async () => {
		const record = seed("user:notes", "The record to forget.");
		const main = subject("main", "all");

		const answer = await call(main, "memory_forget", {
			targets: [record.pos],
			reason: "The note is wrong.",
		});

		expect(answer).toEqual({
			records: [
				{
					addr: `user:notes#${record.pos}`,
					ts: dayOf(record.ts),
					kind: "note",
					body: record.body,
					action: "hidden",
				},
			],
		});
		expect(render(main, "memory_forget", {}, answer)).toBe(
			`hidden user:notes#${record.pos}  ${dayOf(record.ts)}  note  ${record.body}`,
		);
		expect(pending(host.store)).toHaveLength(0);
		const open = (await call(main, "memory_open", {
			target: record.pos,
		})) as { id: string };
		expect(open.id).toBe(record.id);
		const hidden = host.store
			.handle()
			.prepare("SELECT state FROM notes WHERE id = ?")
			.get(record.id) as { state: string };
		expect(hidden.state).toBe("hidden");
	});

	it("distinguishes a proposed hide from a hidden record in its echoes", async () => {
		const record = seed("global:prefs", "The foreign record.");
		const local = seed("user:notes", "The local record.");
		const narrow = subject("narrow", "narrow");

		const answer = await call(narrow, "memory_forget", {
			targets: [local.pos, `global:prefs#${record.pos}`],
			reason: "The note is wrong.",
		});

		expect(answer).toEqual({
			records: [
				{
					addr: `user:notes#${local.pos}`,
					ts: dayOf(local.ts),
					kind: "note",
					body: local.body,
					action: "hidden",
				},
				{
					addr: `global:prefs#${record.pos}`,
					ts: dayOf(record.ts),
					kind: "note",
					body: record.body,
					action: "proposed",
				},
			],
		});
		expect(render(narrow, "memory_forget", {}, answer)).toBe(
			`hidden user:notes#${local.pos}  ${dayOf(local.ts)}  note  ${local.body}\nproposed global:prefs#${record.pos}  ${dayOf(record.ts)}  note  ${record.body}`,
		);
		const open = pending(host.store);
		expect(open).toHaveLength(1);
		expect(open[0]?.op).toBe("hide");
		expect(open[0]?.target).toBe(record.id);
		const state = host.store
			.handle()
			.prepare("SELECT state FROM notes WHERE id = ?")
			.get(record.id) as { state: string };
		expect(state.state).toBe("live");
	});

	it("lists the due records and sets the next review time", async () => {
		const due = seed(
			"user:notes",
			"The due record.",
			nowIso(),
			"2026-11-01T00:00:00.000Z",
		);
		seed(
			"user:notes",
			"The later record.",
			"2030-01-01T00:00:00.000Z",
			"2026-11-02T00:00:00.000Z",
		);
		const main = subject("main", "all");

		const list = (await call(main, "memory_review", {})) as {
			due: { addr: string; body: string }[];
		};
		expect(list.due.map((row) => row.body)).toEqual(["The due record."]);

		const marked = (await call(main, "memory_review", {
			reviewed: [due.pos],
			scope: "user:notes",
			reviewIn: "10d",
		})) as { reviewed: number; next: string };
		expect(marked.reviewed).toBe(1);
		expect(marked.next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(
			render(
				main,
				"memory_review",
				{ reviewed: [due.pos], scope: "user:notes", reviewIn: "10d" },
				marked,
			),
		).toBe(`reviewed 1 records, next ${marked.next}`);
		const empty = (await call(main, "memory_review", {})) as {
			due: unknown[];
		};
		expect(empty.due).toHaveLength(0);
	});

	it("refuses a numeric review target without a scope", async () => {
		seed("user:notes", "The review record.");
		const main = subject("main", "all");

		await expect(
			call(main, "memory_review", { reviewed: [0] }),
		).rejects.toThrow(/needs a scope/);
	});

	it("refuses a review target outside the profile", async () => {
		const record = seed("global:prefs", "The foreign review record.");
		const narrow = subject("narrow", "narrow");

		await expect(
			call(narrow, "memory_review", {
				reviewed: [`global:prefs#${record.pos}`],
			}),
		).rejects.toThrow(/not visible/);
	});

	it("writes a proposal for a child and stores no record", async () => {
		const child = subject("child", "propose", { origin: "subagent" });

		const answer = (await call(child, "memory_note", {
			body: "The child proposes one note.",
			kind: "fact",
		})) as { id: string; proposed: boolean };

		expect(answer.proposed).toBe(true);
		expect(answer.id.length).toBeGreaterThan(0);
		const live = host.store
			.handle()
			.prepare("SELECT COUNT(*) AS count FROM notes")
			.get() as { count: number };
		expect(live.count).toBe(0);
		const open = pending(host.store);
		expect(open).toHaveLength(1);
		expect(open[0]?.id).toBe(answer.id);
		expect(open[0]?.op).toBe("note");
		expect(open[0]?.payload).toContain(child.agent.id);
	});

	it("keeps the time of a note proposal for the parent", async () => {
		const child = subject("child", "propose", { origin: "subagent" });

		const answer = (await call(child, "memory_note", {
			body: "The child proposes one note of a past time.",
			ts: "2026-01-02T03:04:05Z",
		})) as { id: string };

		const open = pending(host.store);
		expect(open).toHaveLength(1);
		expect(open[0]?.id).toBe(answer.id);
		expect(open[0]?.payload).toContain("2026-01-02T03:04:05.000Z");
	});

	it("answers the child with the parent sentence and the body", async () => {
		const child = subject("child", "propose", { origin: "subagent" });
		const args = { body: "The child proposes one note.", kind: "fact" };

		const value = (await call(child, "memory_note", args)) as {
			id: string;
		};
		const text = render(child, "memory_note", args, value);

		expect(text).toContain("Proposed to your parent:");
		expect(text).toContain("The child proposes one note.");
		const view = tool(child, "memory_note").presentResult?.(args, {
			content: [{ type: "text", text }],
			isError: false,
		});
		expect(view).toEqual({
			card: "generic",
			title: expect.stringContaining("Proposed to your parent:"),
		});
	});

	it("reports three proposals of one child to the parent", async () => {
		const parent: Parent = {
			id: "parent-session",
			injected: [],
			inject(message) {
				this.injected.push(message);
			},
		};
		const agents = root as unknown as {
			provide(name: string): void;
			set(name: string, value: unknown): void;
		};
		agents.provide("agents");
		agents.set("agents", {
			get: (id: string) => (id === parent.id ? parent : undefined),
		});
		const child = subject("child", "propose", {
			origin: "subagent",
			parentSession: parent.id,
		});
		const bodies = [
			"The first proposal.",
			"The second proposal.",
			"The third proposal.",
		];
		const ids: string[] = [];
		for (const body of bodies) {
			const answer = (await call(child, "memory_note", { body })) as {
				id: string;
			};
			ids.push(answer.id);
		}

		await child.scope.dispose();

		expect(pending(host.store)).toHaveLength(3);
		expect(parent.injected).toHaveLength(1);
		const message = parent.injected[0];
		const first = message?.content[0];
		const text = first?.type === "text" ? first.text : "";
		const lines = text.split("\n");
		expect(lines).toHaveLength(3);
		const bodyOf = new Map(
			ids.map((id, index) => [id, bodies[index] as string]),
		);
		for (const line of lines) {
			expect(line).toContain(`[memory proposals from ${child.agent.id}]`);
			expect(line).not.toContain("#");
			const id = ids.find((candidate) => line.includes(candidate));
			expect(id).toBeDefined();
			expect(line).toContain(bodyOf.get(id as string) as string);
		}
	});

	it("keeps two agents on their own profile", async () => {
		const main = subject("main", "all");
		const narrow = subject("narrow", "narrow");
		const body = "The shared body of the note.";

		const live = (await call(main, "memory_note", { body })) as {
			state: string;
		};
		const proposed = (await call(narrow, "memory_note", {
			body,
			scope: "global:prefs",
		})) as {
			proposed?: boolean;
		};

		expect(live.state).toBe("live");
		expect(proposed.proposed).toBe(true);
		expect(pending(host.store)).toHaveLength(1);
	});

	it("removes the tools on disposal", async () => {
		const main = subject("main", "all");
		expect(names(main).length).toBe(6);

		await main.scope.dispose();

		expect(root.tools.definitions(main.key)).toHaveLength(0);
	});

	it("names the address form and the review rule in its description", () => {
		const main = subject("main", "all");

		expect(tool(main, "memory_open").description).toContain("scope#pos");
		expect(tool(main, "memory_review").description).toContain("user request");
	});

	it("keeps the active scope after a map call", async () => {
		seed("project:memlens", "The project note.");
		const main = subject("main", "all");

		await call(main, "memory_map", { scope: "project:memlens" });
		const answer = (await call(main, "memory_note", {
			body: "The note of the active scope.",
		})) as { addr: string };

		expect(answer.addr).toMatch(/^user:notes#/);
	});

	it("supersedes one target by pos and by address", async () => {
		const first = seed(
			"user:notes",
			"The first target.",
			null,
			"2026-11-01T00:00:00.000Z",
		);
		const second = seed(
			"user:notes",
			"The second target.",
			null,
			"2026-11-02T00:00:00.000Z",
		);
		const main = subject("main", "all");

		const answer = (await call(main, "memory_note", {
			body: "The note that replaces both targets.",
			ts: "2026-11-01T12:00:00Z",
			supersedes: [first.pos, `user:notes#${second.pos}`],
		})) as { state: string };

		expect(answer.state).toBe("live");
		expect(render(main, "memory_note", {}, answer)).toBe(
			[
				"saved user:notes#1",
				`superseded user:notes#0  ${dayOf(first.ts)}  note  ${first.body}`,
				`superseded user:notes#2  ${dayOf(second.ts)}  note  ${second.body}`,
				"moved: notes #1..#1 of user:notes are now #2..#2. Re-read with memory_map, or find a note with memory_find.",
			].join("\n"),
		);
		const states = host.store
			.handle()
			.prepare("SELECT state FROM notes WHERE id IN (?, ?)")
			.all(first.id, second.id) as { state: string }[];
		expect(states.map((row) => row.state)).toEqual(["hidden", "hidden"]);
	});

	it("refuses a supersede target outside the profile", async () => {
		const record = seed("global:prefs", "The foreign target.");
		const narrow = subject("narrow", "narrow");

		await expect(
			call(narrow, "memory_note", {
				body: "The note of the profile scope.",
				scope: "project:memlens",
				supersedes: [`global:prefs#${record.pos}`],
			}),
		).rejects.toThrow(/not visible/);
		expect(pending(host.store)).toHaveLength(0);
	});

	it("keeps no late store access after disposal", async () => {
		seed("user:notes", "The record of the last test.");
		const child = subject("child", "propose", {
			origin: "subagent",
			parentSession: "parent-session",
		});
		await call(child, "memory_note", { body: "The last proposal." });

		await root.fiber.dispose();

		await expect(child.scope.dispose()).resolves.toBeUndefined();
	});
});
