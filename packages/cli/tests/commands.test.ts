/**
 * CLI command tests.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Verify each command through the real entry with a temporary store, so the CLI meets
 * its contracts.
 * @scope The write commands, the read commands, the transfer commands, and the policy errors.
 * NOT: the library logic, which the core tests cover.
 * @invariants Each test runs in its own temporary home. The tests inject the environment, the
 * working directory, and the confirmation answer.
 * @keywords cli, test, command, note, find, export, import, policy
 * #endregion moduleContract
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import type { CommandIo } from "../src/commands.js";

/** One isolated test context: a temporary home and its input surface. */
interface TestEnv {
	readonly home: string;
	io: CommandIo;
}

/** Each temporary home of this file, for the cleanup after the last test. */
const homes: string[] = [];

afterAll(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
});

/** Make one temporary home, with one optional base configuration file. */
function makeEnv(config?: string): TestEnv {
	const home = mkdtempSync(join(tmpdir(), "memlens-cli-"));
	homes.push(home);
	const configDir = join(home, "config");
	if (config !== undefined) {
		const memlensDir = join(configDir, "memlens");
		mkdirSync(memlensDir, { recursive: true });
		writeFileSync(join(memlensDir, "config.toml"), config);
	}
	return {
		home,
		io: {
			env: {
				HOME: home,
				XDG_CONFIG_HOME: configDir,
				XDG_DATA_HOME: join(home, "data"),
			},
			cwd: home,
			confirm: async () => true,
		},
	};
}

/** The answer of one run: the exit code and the captured answer and error streams. */
interface Answer {
	readonly code: number;
	readonly out: string;
	readonly err: string;
}

/** Run one command line, capture both streams, and keep them intact. */
async function run(env: TestEnv, ...argv: string[]): Promise<Answer> {
	const outWrite = process.stdout.write.bind(process.stdout);
	const errWrite = process.stderr.write.bind(process.stderr);
	let out = "";
	let err = "";
	process.stdout.write = ((chunk: unknown) => {
		out += String(chunk);
		return true;
	}) as typeof process.stdout.write;
	process.stderr.write = ((chunk: unknown) => {
		err += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		const code = await main(argv, env.io);
		return { code, out, err };
	} finally {
		process.stdout.write = outWrite;
		process.stderr.write = errWrite;
	}
}

/** One base configuration that sees the project scopes only. */
const WORK_CONFIG = `
defaultProfile = "work"

[store]
backend = "sqlite"
idle = 300

[writer]
provider = "deepseek"
model = "deepseek-chat"
effort = "off"
mode = "auto"
batch = 6
maxCallsPerHour = 120

[profile.work]
scopes = ["project:*"]

[profile.work.budget]
here = 20
directions = 10

[scope_default]
default = "user:notes"
`;

describe("@memlens/cli commands", () => {
	it("writes, finds, and opens one note", async () => {
		const test = makeEnv();
		const saved = await run(
			test,
			"note",
			"Deploy on friday",
			"--scope",
			"project:acme/x",
		);
		expect(saved.code).toBe(0);
		expect(saved.out).toContain("saved project:acme/x#0");
		const found = await run(test, "find", "friday");
		expect(found.code).toBe(0);
		expect(found.out).toContain("project:acme/x#0");
		const opened = await run(test, "open", "project:acme/x#0");
		expect(opened.code).toBe(0);
		expect(opened.out).toContain("Deploy on friday");
	});

	it("marks a review and lists the due records", async () => {
		const test = makeEnv();
		await run(test, "note", "Check the certificate", "--scope", "project:ssl");
		const mark = await run(
			test,
			"review",
			"--mark",
			"project:ssl#0",
			"--for",
			"0d",
		);
		expect(mark.code).toBe(0);
		expect(mark.out).toContain("reviewed project:ssl#0");
		const due = await run(test, "review", "--limit", "10");
		expect(due.code).toBe(0);
		expect(due.out).toContain("Check the certificate");
	});

	it("amends a note and hides a note", async () => {
		const test = makeEnv();
		await run(test, "note", "First text", "--scope", "project:acme/x");
		const amend = await run(
			test,
			"amend",
			"project:acme/x#0",
			"--body",
			"Second text",
		);
		expect(amend.code).toBe(0);
		const opened = await run(test, "open", "project:acme/x#0");
		expect(opened.out).toContain("Second text");
		const hidden = await run(test, "forget", "project:acme/x#0");
		expect(hidden.code).toBe(0);
		expect(hidden.out).toContain("hidden project:acme/x#0");
	});

	it("redacts a note and clears the content", async () => {
		const test = makeEnv();
		await run(test, "note", "Secret marker", "--scope", "user:private");
		const redact = await run(test, "redact", "user:private#0", "--yes");
		expect(redact.code).toBe(0);
		expect(redact.out).toContain("redacted user:private#0");
		const found = await run(test, "find", "Secret");
		expect(found.out).not.toContain("Secret marker");
	});

	it("refuses a redact without a confirmation", async () => {
		const test = makeEnv();
		await run(test, "note", "Keep me", "--scope", "user:private");
		test.io = { ...test.io, confirm: async () => false };
		const refused = await run(test, "redact", "user:private#0");
		expect(refused.code).toBe(0);
		expect(refused.out).toContain("cancelled");
	});

	it("gives NotAllowed and the exit code 3 for a target outside the profile", async () => {
		const test = makeEnv(WORK_CONFIG);
		await run(test, "note", "Outside note", "--scope", "user:other");
		const refused = await run(test, "forget", "user:other#0");
		expect(refused.code).toBe(3);
		expect(refused.err).toContain("not visible");
	});

	it("gives the exit code 1 for a supersede across scopes", async () => {
		const test = makeEnv();
		await run(test, "note", "Left note", "--scope", "project:left");
		await run(test, "note", "Right note", "--scope", "project:right");
		const third = await run(
			test,
			"note",
			"Third note",
			"--scope",
			"project:right",
			"--supersedes",
			"project:left#0",
		);
		expect(third.code).toBe(1);
	});

	it("lists the scopes, resolves the active scope, and renders the slice", async () => {
		const test = makeEnv();
		await run(test, "note", "Slice note", "--scope", "project:acme/x");
		const scopes = await run(test, "scopes");
		expect(scopes.code).toBe(0);
		expect(scopes.out).toContain("project:acme/x");
		const scope = await run(test, "scope");
		expect(scope.code).toBe(0);
		expect(scope.out).toContain("user:notes");
		const slice = await run(test, "slice", "--scope", "project:acme/x");
		expect(slice.code).toBe(0);
		expect(slice.out).toContain("<memory>");
		expect(slice.out).toContain("Slice note");
	});

	it("gives the store status", async () => {
		const test = makeEnv();
		await run(test, "note", "Status note", "--scope", "project:acme/x");
		const status = await run(test, "status");
		expect(status.code).toBe(0);
		expect(status.out).toContain("backend: sqlite");
	});

	it("exports markdown with an encoded name and no node section", async () => {
		const test = makeEnv();
		await run(test, "note", "Export note", "--scope", "project:a/b");
		const out = join(test.home, "out");
		const answer = await run(test, "export", "--format", "md", "--out", out);
		expect(answer.code).toBe(0);
		const file = join(out, "project%3Aa%2Fb.md");
		expect(existsSync(file)).toBe(true);
		const text = readFileSync(file, "utf8");
		expect(text).toContain("scope: project:a/b");
		expect(text).toContain("## #0");
		expect(text).not.toContain('"node"');
	});

	it("exports one scope and imports it into another store", async () => {
		const first = makeEnv();
		await run(first, "note", "Move note", "--scope", "project:acme/x");
		const out = join(first.home, "out");
		await run(
			first,
			"export",
			"--format",
			"jsonl",
			"--out",
			out,
			"--scope",
			"project:acme/x",
		);
		const copy = readFileSync(join(out, "project%3Aacme%2Fx.jsonl"), "utf8");
		expect(copy).not.toContain('"pos"');

		const second = makeEnv();
		const input = join(second.home, "in.jsonl");
		writeFileSync(input, copy);
		const planned = await run(second, "import", "--in", input, "--dry-run");
		expect(planned.code).toBe(0);
		expect(planned.out).toContain("would import 1 events");
		const imported = await run(second, "import", "--in", input);
		expect(imported.code).toBe(0);
		expect(imported.out).toContain("imported 1 events");
		const again = await run(second, "import", "--in", input);
		expect(again.out).toContain("imported 0 events");
		const found = await run(second, "find", "Move");
		expect(found.out).toContain("project:acme/x#0");
	});

	it("sets and gets one configuration key", async () => {
		const test = makeEnv();
		const set = await run(test, "config", "set", "store.idle", "60");
		expect(set.code).toBe(0);
		const got = await run(test, "config", "get", "store.idle");
		expect(got.code).toBe(0);
		expect(got.out).toContain("store.idle: 60");
	});

	it("publishes one copy input and gives a compaction job with --max", async () => {
		const test = makeEnv();
		await run(test, "note", "Lone note", "--scope", "project:acme/x");
		const copy = await run(test, "compact", "--scope", "project:acme/x");
		expect(copy.code).toBe(0);
		expect(copy.out).toContain("published 1 copies");
		expect(copy.out).toContain("no merge inputs");
		for (const body of ["Two", "Three", "Four", "Five"])
			await run(test, "note", `${body} note`, "--scope", "project:acme/x");
		const limited = await run(
			test,
			"compact",
			"--scope",
			"project:acme/x",
			"--max",
			"1",
		);
		expect(limited.code).toBe(0);
		expect(limited.out).toContain("#0-1");
		expect(limited.out).not.toContain("#2-3");
		const dry = await run(
			test,
			"compact",
			"--scope",
			"project:acme/x",
			"--dry-run",
		);
		expect(dry.out).toContain("would publish");
	});

	it("writes the answers of a compaction job as nodes", async () => {
		const test = makeEnv();
		await run(test, "note", "First note", "--scope", "project:acme/x");
		await run(test, "note", "Second note", "--scope", "project:acme/x");
		const job = await run(test, "compact", "--scope", "project:acme/x");
		expect(job.out).toContain("#0-1");
		expect(job.out).toContain("First note");
		const answer = join(test.home, "answer.txt");
		writeFileSync(answer, "#0-1: One line over both notes");
		const applied = await run(
			test,
			"compact",
			"--answer",
			answer,
			"--scope",
			"project:acme/x",
		);
		expect(applied.code).toBe(0);
		expect(applied.out).toContain("built 1 nodes");
		const out = join(test.home, "out");
		const exported = await run(
			test,
			"export",
			"--format",
			"jsonl",
			"--out",
			out,
			"--scope",
			"project:acme/x",
		);
		expect(exported.code).toBe(0);
		expect(
			readFileSync(join(out, "project%3Aacme%2Fx.jsonl"), "utf8"),
		).toContain("One line over both notes");
	});

	it("refuses a compaction of a scope outside the profile", async () => {
		const test = makeEnv(WORK_CONFIG);
		const refused = await run(test, "compact", "--scope", "user:other");
		expect(refused.code).toBe(3);
	});

	it("checks a healthy store and repairs an incomplete jsonl tail", async () => {
		const test = makeEnv(`
defaultProfile = "default"

[store]
backend = "jsonl"
idle = 300

[writer]
provider = "deepseek"
model = "deepseek-chat"
effort = "off"
mode = "auto"
batch = 6
maxCallsPerHour = 120

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10

[scope_default]
default = "user:notes"
`);
		await run(test, "note", "Check note", "--scope", "project:acme/x");
		const clean = await run(test, "check");
		expect(clean.code).toBe(0);
		expect(clean.out).toContain("ok");
		const source = join(test.home, "data", "memlens", "memlens.jsonl");
		appendFileSync(source, '{"op":"partial"');
		const dirty = await run(test, "check");
		expect(dirty.code).toBe(1);
		expect(dirty.out).toContain("incomplete bytes");
		const planned = await run(test, "repair", "--dry-run");
		expect(planned.code).toBe(0);
		expect(planned.out).toContain("truncate");
		const repaired = await run(test, "repair");
		expect(repaired.code).toBe(0);
		expect(readFileSync(source, "utf8")).not.toContain("partial");
		const after = await run(test, "check");
		expect(after.code).toBe(0);
	});

	it("imports one scope under another key with --as", async () => {
		const first = makeEnv();
		await run(first, "note", "Move me", "--scope", "project:acme/x");
		const out = join(first.home, "out");
		await run(
			first,
			"export",
			"--format",
			"jsonl",
			"--out",
			out,
			"--scope",
			"project:acme/x",
		);
		const copy = readFileSync(join(out, "project%3Aacme%2Fx.jsonl"), "utf8");
		const second = makeEnv();
		const input = join(second.home, "in.jsonl");
		writeFileSync(input, copy);
		const imported = await run(
			second,
			"import",
			"--in",
			input,
			"--as",
			"project:other/y",
		);
		expect(imported.code).toBe(0);
		const found = await run(second, "find", "Move");
		expect(found.out).toContain("project:other/y#0");
		expect(found.out).not.toContain("project:acme/x");
	});
});
