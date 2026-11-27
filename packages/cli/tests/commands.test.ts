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

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NOTE_KINDS } from "@memlens/core";
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

/** Check the key and the source at the end of the scope answer. */
function expectScope(answer: Answer, key: string, from: string): void {
	expect(answer.out).toContain(`scope  ${key}\nfrom   ${from}`);
}

/** One base configuration with one profile over one scope set. */
function baseConfig(profile: string, scopes: string): string {
	return `
defaultProfile = "${profile}"

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"
effort = "off"
batch = 6
maxCallsPerHour = 120

[profile.${profile}]
scopes = ${scopes}

[profile.${profile}.budget]
here = 20
directions = 10

[scope_default]
default = "user:notes"
`;
}

/** One base configuration that sees the project scopes only. */
const WORK_CONFIG = baseConfig("work", '["project:*"]');

describe("@memlens/cli commands", () => {
	it("previews and moves a scope, reports cleared rows, and repeats without writes", async () => {
		const test = makeEnv(WORK_CONFIG);
		const src = "project:source";
		const dst = "project:destination";
		for (const [index, body] of [
			"movecanary first",
			"movecanary second",
			"cleared fact",
		].entries()) {
			expect(
				(
					await run(
						test,
						"note",
						body,
						"--scope",
						src,
						"--ts",
						`2026-01-0${index + 1}T00:00:00.000Z`,
					)
				).code,
			).toBe(0);
		}
		expect(
			(await run(test, "note", "movecanary first", "--scope", dst)).code,
		).toBe(0);
		expect((await run(test, "redact", `${src}#2`, "--yes")).code).toBe(0);
		const dir = join(test.home, "data", "memlens");
		const db = new DatabaseSync(join(dir, "memlens.db"));
		try {
			const snapshot = () =>
				["notes", "nodes", "journal", "meta"].map((table) =>
					db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
				);
			const before = snapshot();
			const preview = await run(test, "move", src, dst, "--dry-run");
			expect(preview.code).toBe(0);
			expect(preview.out).toBe(
				`would move 2 notes from ${src} to ${dst}\nskipped cleared ${src}#2\n`,
			);
			expect(snapshot()).toEqual(before);
			const moved = await run(test, "move", src, dst);
			expect(moved.code).toBe(0);
			expect(moved.out).toBe(
				`moved 2 notes from ${src} to ${dst}\nskipped cleared ${src}#2\n`,
			);
			expect(
				(await run(test, "find", "movecanary", "--scope", src, "--json")).out,
			).toBe("[]\n");
			const hits = JSON.parse(
				(await run(test, "find", "movecanary", "--scope", dst, "--json")).out,
			);
			expect(hits).toHaveLength(3);
			expect((await run(test, "check")).code).toBe(0);
			const after = snapshot();
			expect((await run(test, "move", src, dst)).out).toBe(
				`moved 0 notes from ${src} to ${dst}\nskipped cleared ${src}#2\n`,
			);
			expect((await run(test, "move", dst, dst)).out).toBe(
				`moved 0 notes from ${dst} to ${dst}\n`,
			);
			expect(snapshot()).toEqual(after);
		} finally {
			db.close();
		}
	});

	it("moves into a new scope and allows an empty source", async () => {
		const test = makeEnv(WORK_CONFIG);
		expect(
			(await run(test, "note", "A misplaced fact", "--scope", "project:old"))
				.code,
		).toBe(0);
		expect((await run(test, "move", "project:old", "project:new")).out).toBe(
			"moved 1 notes from project:old to project:new\n",
		);
		expect((await run(test, "move", "project:old", "project:new")).out).toBe(
			"moved 0 notes from project:old to project:new\n",
		);
	});

	it("validates move arguments and both profile scopes before a write", async () => {
		const test = makeEnv(WORK_CONFIG);
		for (const args of [
			[],
			["project:src"],
			["project:src", "project:dst", "extra"],
			["project:src", "project:dst", "--scope", "project:x"],
		]) {
			expect((await run(test, "move", ...args)).code).toBe(2);
		}
		for (const [src, dst] of [
			["user:other", "project:dst"],
			["project:src", "user:other"],
		] as const) {
			expect((await run(test, "move", src, dst)).code).toBe(3);
		}
		for (const [src, dst] of [
			["bad", "project:dst"],
			["project:src", "bad"],
		] as const) {
			expect((await run(test, "move", src, dst)).code).toBe(1);
		}
	});

	it("uses the repository scope for scope, note, and slice", async () => {
		const test = makeEnv();
		const repo = join(test.home, "My-Repo");
		mkdirSync(repo);
		execFileSync("git", ["init", "-q", repo]);
		const nested = join(repo, "nested");
		mkdirSync(nested);
		test.io = { ...test.io, cwd: nested };
		expectScope(await run(test, "scope"), "project:My-Repo", "automatic git");
		expect((await run(test, "note", "Automatic scope")).out).toContain(
			"saved project:My-Repo#0",
		);
		expect((await run(test, "slice")).out).toContain("Automatic scope");
		expect(
			(await run(test, "note", "Explicit scope", "--scope", "user:other")).out,
		).toContain("saved user:other#0");
	});

	it("uses the main repository name in a Git worktree", async () => {
		const test = makeEnv();
		const repo = join(test.home, "main-repo");
		const worktree = join(test.home, "random-worktree");
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"-qm",
			"initial",
		]);
		execFileSync("git", [
			"-C",
			repo,
			"worktree",
			"add",
			"-q",
			"--detach",
			worktree,
		]);
		test.io = { ...test.io, cwd: worktree };
		expectScope(await run(test, "scope"), "project:main-repo", "automatic git");
	});

	it("matches Git remote rules before the repository scope", async () => {
		const config = WORK_CONFIG.replace(
			"[scope_default]",
			'[scope_default]\nrules = [{ match = "git_remote", glob = "github.com/knopki/*", key = "project:{repo}" }]',
		);
		const test = makeEnv(config);
		execFileSync("git", ["init", "-q", test.home]);
		execFileSync("git", [
			"-C",
			test.home,
			"remote",
			"add",
			"origin",
			"git@github.com:knopki/Remote-Name.git",
		]);
		expectScope(await run(test, "scope"), "project:Remote-Name", "rule 0");
		expect((await run(test, "note", "Remote rule")).out).toContain(
			"saved project:Remote-Name#0",
		);
	});

	it("matches a Git remote rule with no .git suffix", async () => {
		const config = WORK_CONFIG.replace(
			"[scope_default]",
			'[scope_default]\nrules = [{ match = "git_remote", glob = "github.com/knopki/yascheduler", key = "project:absolidix/yascheduler" }]',
		);
		const test = makeEnv(config);
		execFileSync("git", ["init", "-q", test.home]);
		execFileSync("git", [
			"-C",
			test.home,
			"remote",
			"add",
			"origin",
			"git@github.com:knopki/yascheduler.git",
		]);
		expectScope(
			await run(test, "scope"),
			"project:absolidix/yascheduler",
			"rule 0",
		);
	});

	it("shows the inputs and the verdict of each rule", async () => {
		const config = WORK_CONFIG.replace(
			"[scope_default]",
			'[scope_default]\nrules = [{ match = "git_remote", glob = "github.com/other/*", key = "project:x/y" }]',
		);
		const test = makeEnv(config);
		execFileSync("git", ["init", "-q", test.home]);
		execFileSync("git", [
			"-C",
			test.home,
			"remote",
			"add",
			"origin",
			"git@github.com:knopki/yascheduler.git",
		]);
		const answer = await run(test, "scope");
		expect(answer.out).toContain(
			"remote     git@github.com:knopki/yascheduler.git",
		);
		expect(answer.out).toContain("canonical  github.com/knopki/yascheduler");
		expect(answer.out).toContain(
			"[0] git_remote github.com/other/* -> no match",
		);
		expectScope(answer, "project:knopki/yascheduler", "automatic git_remote");
	});

	it("uses a configured path rule before the repository scope", async () => {
		const test = makeEnv(
			WORK_CONFIG.replace(
				"[scope_default]",
				'[scope_default]\nrules = [{ match = "path", glob = "*", key = "project:chosen" }]',
			),
		);
		execFileSync("git", ["init", "-q", test.home]);
		expectScope(await run(test, "scope"), "project:chosen", "rule 0");
		expect((await run(test, "note", "Rule scope")).out).toContain(
			"saved project:chosen#0",
		);
	});

	it("uses a directory name with a leading period", async () => {
		const test = makeEnv(WORK_CONFIG);
		const hidden = join(test.home, ".hidden");
		mkdirSync(hidden);
		test.io = { ...test.io, cwd: hidden };
		expectScope(await run(test, "scope"), "project:.hidden", "automatic path");
	});

	it("replaces each forbidden sign of a directory name", async () => {
		const test = makeEnv(WORK_CONFIG);
		const spaced = join(test.home, "my notes");
		mkdirSync(spaced);
		test.io = { ...test.io, cwd: spaced };
		expectScope(await run(test, "scope"), "project:my_notes", "automatic path");
	});

	it("uses the configured default at the file system root", async () => {
		const test = makeEnv(WORK_CONFIG);
		test.io = { ...test.io, cwd: "/" };
		expectScope(await run(test, "scope"), "user:notes", "automatic default");
	});

	it("answers a profile that the base file does not name", async () => {
		const test = makeEnv();
		const repo = join(test.home, "ghost-profile");
		mkdirSync(repo);
		test.io = { ...test.io, cwd: repo };
		expect((await run(test, "note", "Ghost profile note")).code).toBe(0);
		const slice = await run(test, "slice", "--profile", "ghost");
		expect(slice.code).toBe(0);
		expect(slice.out).toContain("Ghost profile note");
	});

	it("answers a base file that names no profile at all", async () => {
		const test = makeEnv('defaultProfile = "default"\n');
		const repo = join(test.home, "bare-base");
		mkdirSync(repo);
		test.io = { ...test.io, cwd: repo };
		expect((await run(test, "note", "Bare base note")).code).toBe(0);
		const slice = await run(test, "slice");
		expect(slice.code).toBe(0);
		expect(slice.out).toContain("Bare base note");
	});

	it("uses the Git remote with no rule", async () => {
		const test = makeEnv();
		const repo = join(test.home, "remote-repo");
		mkdirSync(repo);
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"remote",
			"add",
			"origin",
			"git@github.com:knopki/Remote-Name.git",
		]);
		test.io = { ...test.io, cwd: repo };
		expectScope(
			await run(test, "scope"),
			"project:knopki/Remote-Name",
			"automatic git_remote",
		);
	});

	it("uses the first remote when origin is absent", async () => {
		const test = makeEnv();
		const repo = join(test.home, "first-remote");
		mkdirSync(repo);
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"remote",
			"add",
			"upstream",
			"ssh://git@github.com/knopki/Upstream-Name.git",
		]);
		test.io = { ...test.io, cwd: repo };
		expectScope(
			await run(test, "scope"),
			"project:knopki/Upstream-Name",
			"automatic git_remote",
		);
		execFileSync("git", [
			"-C",
			repo,
			"remote",
			"add",
			"origin",
			"git@github.com:knopki/Origin-Name.git",
		]);
		expectScope(
			await run(test, "scope"),
			"project:knopki/Origin-Name",
			"automatic git_remote",
		);
	});

	it("keeps an SSH alias remote in the automatic scope", async () => {
		const test = makeEnv();
		const repo = join(test.home, "alias-repo");
		mkdirSync(repo);
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"remote",
			"add",
			"origin",
			"git@server:knopki/Custom-Name.git",
		]);
		test.io = { ...test.io, cwd: repo };
		expectScope(
			await run(test, "scope"),
			"project:knopki/Custom-Name",
			"automatic git_remote",
		);
	});

	it("does not take the organization from a local remote", async () => {
		const test = makeEnv();
		const repo = join(test.home, "Local-Repo");
		mkdirSync(repo);
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"remote",
			"add",
			"origin",
			"/srv/git/Local-Repo.git",
		]);
		test.io = { ...test.io, cwd: repo };
		expectScope(
			await run(test, "scope"),
			"project:Local-Repo",
			"automatic git",
		);
	});

	it("uses the directory name when no Git repository exists", async () => {
		const test = makeEnv();
		const directory = join(test.home, "Plain-Directory");
		mkdirSync(directory);
		test.io = { ...test.io, cwd: directory };
		expectScope(
			await run(test, "scope"),
			"project:Plain-Directory",
			"automatic path",
		);
		expect((await run(test, "note", "Directory note")).out).toContain(
			"saved project:Plain-Directory#0",
		);
	});
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

	it("lists the newest notes for an empty query and cuts them with --limit", async () => {
		const test = makeEnv();
		for (let pos = 0; pos < 12; pos += 1)
			expect(
				(await run(test, "note", `Row ${pos}`, "--scope", "project:acme/x"))
					.code,
			).toBe(0);
		const lines = (text: string): string[] => text.split("\n").filter(Boolean);
		const newest = await run(test, "find", "--scope", "project:acme/x");
		expect(newest.code).toBe(0);
		expect(lines(newest.out)).toHaveLength(10);
		const two = await run(
			test,
			"find",
			"--scope",
			"project:acme/x",
			"--limit",
			"2",
		);
		expect(two.code).toBe(0);
		expect(lines(two.out)).toHaveLength(2);
	});

	it("finds one kind and refuses an unknown kind", async () => {
		const test = makeEnv();
		await run(
			test,
			"note",
			"A task",
			"--scope",
			"project:acme/x",
			"--kind",
			"task",
		);
		await run(
			test,
			"note",
			"A fact",
			"--scope",
			"project:acme/x",
			"--kind",
			"fact",
		);
		const found = await run(
			test,
			"find",
			"--kind",
			"task",
			"--scope",
			"project:acme/x",
		);
		expect(found.code).toBe(0);
		expect(found.out).toContain("A task");
		expect(found.out).not.toContain("A fact");
		const unknown = await run(test, "find", "--kind", "urgent");
		expect(unknown.code).toBe(2);
		expect(unknown.err).toContain("argument 'urgent' is invalid");
	});

	it("takes the short flags of each command", async () => {
		const test = makeEnv();
		const saved = await run(
			test,
			"note",
			"Short flags",
			"-s",
			"project:acme/x",
			"-k",
			"fact",
		);
		expect(saved.code).toBe(0);
		const found = await run(
			test,
			"find",
			"-k",
			"fact",
			"-s",
			"project:acme/x",
			"-l",
			"1",
		);
		expect(found.code).toBe(0);
		expect(found.out).toContain("Short flags");
	});

	it.each(NOTE_KINDS)(
		"shows the note kind %s in the open header",
		async (kind) => {
			const test = makeEnv();
			expect(
				(
					await run(
						test,
						"note",
						"A fact",
						"--scope",
						"project:acme/x",
						"--kind",
						kind,
					)
				).code,
			).toBe(0);
			const opened = await run(
				test,
				"open",
				"project:acme/x#0",
				"--no-longform",
			);
			expect(opened.code).toBe(0);
			expect(opened.out.split("\n")[0]).toMatch(
				new RegExp(`^project:acme/x#0  \\d{4}-\\d{2}-\\d{2}  ${kind}  review `),
			);
		},
	);

	it("gives the whole longform and no offset hint", async () => {
		const test = makeEnv();
		const file = join(test.home, "doc.md");
		const longform = "doc ".repeat(500);
		writeFileSync(file, longform);
		const saved = await run(
			test,
			"note",
			"A decision",
			"--scope",
			"project:acme/x",
			"--longform",
			file,
		);
		expect(saved.code).toBe(0);

		const opened = await run(test, "open", "project:acme/x#0");

		expect(opened.code).toBe(0);
		expect(opened.out).toContain(`--- longform ${longform.length} chars ---`);
		expect(opened.out).toContain("doc doc doc");
		expect(opened.out).not.toContain("next offset");
		const offset = await run(
			test,
			"open",
			"project:acme/x#0",
			"--offset",
			"10",
		);
		expect(offset.code).toBe(2);
		expect(offset.err).toContain("--offset");
	});

	it("gives no longform section for a note without a document", async () => {
		const test = makeEnv();
		await run(test, "note", "A plain fact", "--scope", "project:acme/x");

		const opened = await run(test, "open", "project:acme/x#0");

		expect(opened.code).toBe(0);
		expect(opened.out).not.toContain("longform");
	});

	it("opens a range in days and with the text of each half", async () => {
		const test = makeEnv();
		for (const [index, body] of [
			"First fact",
			"Second fact",
			"Third fact",
		].entries()) {
			const saved = await run(
				test,
				"note",
				body,
				"--scope",
				"project:acme/x",
				"--ts",
				`2026-01-0${index + 1}T00:00:00Z`,
			);
			expect(saved.code).toBe(0);
		}

		const opened = await run(test, "open", "project:acme/x#0-3");
		expect(opened.code).toBe(0);
		expect(opened.out).toContain("First fact; Second fact");
		expect(opened.out).toContain("Third fact");
		expect(opened.out).not.toContain("T00");
		expect(opened.out).not.toContain("no summary yet");

		const empty = await run(test, "open", "project:acme/x#8-9");
		expect(empty.code).toBe(0);
		expect(empty.out).toContain("The range holds no record.");
	});

	it("writes a note of a past time with the flag --ts", async () => {
		const test = makeEnv();
		await run(test, "note", "Later fact", "--scope", "project:acme/x");
		const backdated = await run(
			test,
			"note",
			"Earlier fact",
			"--scope",
			"project:acme/x",
			"--ts",
			"2026-01-02T03:04:05Z",
		);
		expect(backdated.code).toBe(0);
		expect(backdated.out).toContain("saved project:acme/x#0");
		const opened = await run(test, "open", "project:acme/x#0", "--json");
		expect(JSON.parse(opened.out).ts).toBe("2026-01-02T03:04:05.000Z");
		const bad = await run(test, "note", "No date", "--ts", "yesterday");
		expect(bad.code).toBe(2);
		expect(bad.err).toContain("--ts");
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

	it("restores a hidden note outside the profile scope list", async () => {
		const plain = makeEnv();
		const dir = join(plain.home, "store");
		await run(
			plain,
			"note",
			"Muted fact",
			"--scope",
			"user:other",
			"--store",
			dir,
		);
		await run(plain, "forget", "user:other#0", "--store", dir);
		const restricted = makeEnv(WORK_CONFIG);
		expect(
			(await run(restricted, "forget", "user:other#0", "--store", dir)).code,
		).toBe(3);
		const restored = await run(
			restricted,
			"restore",
			"user:other#0",
			"--reason",
			"Operator request.",
			"--store",
			dir,
		);
		expect(restored.code).toBe(0);
		expect(restored.out).toBe("restored user:other#0\n");
		const found = await run(plain, "find", "Muted", "--store", dir);
		expect(found.out).toContain("user:other#0");
		const journal = JSON.parse(
			(await run(plain, "journal", "--json", "--store", dir)).out,
		);
		expect(journal.at(-1)).toMatchObject({
			op: "restore",
			scope: "user:other",
			reason: "Operator request.",
		});
	});

	it("restores with the flag --scope and the default reason", async () => {
		const test = makeEnv();
		await run(test, "note", "Muted fact", "--scope", "project:acme/x");
		const refused = await run(test, "restore", "project:acme/x#0");
		expect(refused.code).toBe(1);
		await run(test, "forget", "project:acme/x#0");
		const restored = await run(
			test,
			"restore",
			"0",
			"--scope",
			"project:acme/x",
		);
		expect(restored.code).toBe(0);
		expect(restored.out).toBe("restored project:acme/x#0\n");
		const journal = JSON.parse((await run(test, "journal", "--json")).out);
		expect(journal.at(-1)).toMatchObject({
			op: "restore",
			reason: "cli restore",
		});
	});

	it("changes the kind and adds a supersedes link on amend", async () => {
		const test = makeEnv();
		const dir = join(test.home, "store");
		await run(
			test,
			"note",
			"First text",
			"--scope",
			"project:acme/x",
			"--store",
			dir,
		);
		await run(
			test,
			"note",
			"Second text",
			"--scope",
			"project:acme/x",
			"--store",
			dir,
		);
		const kind = await run(
			test,
			"amend",
			"project:acme/x#0",
			"--kind",
			"decision",
			"--store",
			dir,
		);
		expect(kind.code).toBe(0);
		const found = await run(test, "find", "First", "--json", "--store", dir);
		expect(JSON.parse(found.out)).toMatchObject([{ kind: "decision" }]);
		const link = await run(
			test,
			"amend",
			"project:acme/x#1",
			"--supersedes",
			"0",
			"--store",
			dir,
		);
		expect(link.code).toBe(0);
		const gone = await run(test, "find", "First", "--json", "--store", dir);
		expect(JSON.parse(gone.out)).toEqual([]);
		const db = new DatabaseSync(join(dir, "memlens.db"));
		const target = db
			.prepare(
				"SELECT state, superseded_by FROM notes WHERE scope = ? AND pos = 0",
			)
			.get("project:acme/x");
		db.close();
		expect(target?.state).toBe("hidden");
		expect(target?.superseded_by).not.toBeNull();
		const status = await run(test, "status", "--json", "--store", dir);
		expect(JSON.parse(status.out)).toMatchObject({ live: 1 });
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
		const directory = join(test.home, "plain-directory");
		mkdirSync(directory);
		test.io = { ...test.io, cwd: directory };
		const scope = await run(test, "scope");
		expect(scope.code).toBe(0);
		expectScope(scope, "project:plain-directory", "automatic path");
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
		expect(status.out).toContain("path:");
		expect(status.out).toContain("rev:");
	});

	it("shows the journal rows in order and honors the limit", async () => {
		const test = makeEnv();
		await run(test, "note", "Kept text", "--scope", "project:acme/x");
		await run(test, "note", "Hidden text", "--scope", "project:acme/x");
		await run(test, "forget", "project:acme/x#1");
		const whole = await run(test, "journal");
		expect(whole.code).toBe(0);
		expect(whole.out.trim().split("\n")).toHaveLength(3);
		const limited = await run(test, "journal", "--limit", "2");
		expect(limited.code).toBe(0);
		const lines = limited.out.trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/ {2}note {2}/);
		expect(lines[1]).toMatch(/ {2}hide {2}/);
		expect(lines[1]).toContain("project:acme/x");
		const narrow = await run(test, "journal", "--scope", "project:other");
		expect(narrow.code).toBe(0);
		expect(narrow.out).toBe("");
		const json = await run(test, "journal", "--json");
		expect(json.code).toBe(0);
		const rows = JSON.parse(json.out) as { op: string }[];
		expect(rows.map((row) => row.op)).toEqual(["note", "note", "hide"]);
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

	it("exports one long scope name as one cut file", async () => {
		const test = makeEnv();
		const scope = `project:${"a".repeat(300)}`;
		await run(test, "note", "Long note", "--scope", scope);
		const out = join(test.home, "out");
		const answer = await run(test, "export", "--format", "md", "--out", out);
		expect(answer.code).toBe(0);
		const [file] = readdirSync(out);
		expect(file).toMatch(/^project%3Aa{230}~[0-9a-f]{8}\.md$/);
		expect(readFileSync(join(out, file), "utf8")).toContain(`scope: ${scope}`);
	});

	it("exports one scope and imports it into another store", async () => {
		const first = makeEnv();
		await run(first, "note", "Move note", "--scope", "project:acme/x");
		await run(first, "note", "Stay note", "--scope", "project:other/y");
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
		expect(copy).toContain('"format":1');
		expect(copy).not.toContain('"pos"');
		expect(copy).toContain("project:acme/x");
		expect(copy).not.toContain("project:other/y");

		const second = makeEnv();
		const input = join(second.home, "in.jsonl");
		writeFileSync(input, copy);
		const planned = await run(second, "import", "--in", input, "--dry-run");
		expect(planned.code).toBe(0);
		expect(planned.out).toContain("would import 1 notes");
		const imported = await run(second, "import", "--in", input);
		expect(imported.code).toBe(0);
		expect(imported.out).toContain("imported 1 notes");
		const again = await run(second, "import", "--in", input);
		expect(again.out).toContain("imported 0 notes");
		const found = await run(second, "find", "Move");
		expect(found.out).toContain("project:acme/x#0");
	});

	it("shows the resolved configuration", async () => {
		const test = makeEnv();
		const shown = await run(test, "config", "show");
		expect(shown.code).toBe(0);
		expect(shown.out).toContain("[profile]");
		expect(shown.out).toContain("here = 20");
		const json = JSON.parse((await run(test, "config", "show", "--json")).out);
		expect(json.budget).toMatchObject({ here: 20, directions: 10 });
		expect(json.review).toMatchObject({
			decision: 90,
			preference: 180,
			fact: 30,
			gotcha: 90,
			task: 7,
			note: 180,
		});
		const work = makeEnv(WORK_CONFIG);
		const scoped = JSON.parse(
			(await run(work, "config", "show", "--json", "--profile", "work")).out,
		);
		expect(scoped.profile.scopes).toEqual(["project:*"]);
		const removed = await run(test, "config", "get", "store.idle");
		expect(removed.code).toBe(2);
		expect(removed.err).toContain("unknown command 'get'");
	});

	it("publishes one copy input and gives a compaction job with --max", async () => {
		const test = makeEnv();
		await run(
			test,
			"note",
			`Lone ${"detail ".repeat(60)}`,
			"--scope",
			"project:acme/x",
		);
		const copy = await run(test, "compact", "--scope", "project:acme/x");
		expect(copy.code).toBe(0);
		expect(copy.out).toContain("published");
		expect(copy.out).toContain("no merge inputs");
		for (const body of ["Two", "Three", "Four", "Five"])
			await run(
				test,
				"note",
				`${body} ${"detail ".repeat(80)}`,
				"--scope",
				"project:acme/x",
			);
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

	it("completes the join chain of fitting pairs in one run", async () => {
		const test = makeEnv();
		for (const body of ["Alpha", "Beta", "Gamma", "Delta"])
			await run(test, "note", body, "--scope", "project:acme/x");
		const joined = await run(test, "compact", "--scope", "project:acme/x");
		expect(joined.code).toBe(0);
		expect(joined.out).toContain("published 0 copies, 3 joins");
		expect(joined.out).toContain("no merge inputs");
		const settled = await run(test, "compact", "--scope", "project:acme/x");
		expect(settled.out).toContain("published 0 copies, 0 joins");
	});

	it("writes the answers of a compaction job as nodes", async () => {
		const test = makeEnv();
		await run(
			test,
			"note",
			`First ${"detail ".repeat(80)}`,
			"--scope",
			"project:acme/x",
		);
		await run(
			test,
			"note",
			`Second ${"detail ".repeat(80)}`,
			"--scope",
			"project:acme/x",
		);
		const job = await run(test, "compact", "--scope", "project:acme/x");
		expect(job.out).toContain("#0-1");
		expect(job.out).toContain("First");
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
		const after = await run(test, "compact", "--scope", "project:acme/x");
		expect(after.code).toBe(0);
		expect(after.out).not.toContain("#0-1");
	});

	it("gives the whole longform above 1024 chars to the compaction job", async () => {
		const test = makeEnv();
		const longform = `${"head ".repeat(300)}LONGFORM-TAIL`;
		expect(longform.length).toBeGreaterThan(1024);
		const file = join(test.home, "doc.md");
		writeFileSync(file, longform);
		for (const body of ["First body", "Second body"])
			await run(
				test,
				"note",
				body,
				"--scope",
				"project:acme/x",
				"--longform",
				file,
			);
		const job = await run(test, "compact", "--scope", "project:acme/x");
		expect(job.code).toBe(0);
		expect(job.out).toContain("#0-1");
		expect(job.out.match(/LONGFORM-TAIL/g)).toHaveLength(2);
		expect(job.out).toContain(longform);
	});

	it("gives the whole longform of a singleton input to the compaction job", async () => {
		const test = makeEnv();
		const longform = `${"only ".repeat(300)}SINGLETON-TAIL`;
		expect(longform.length).toBeGreaterThan(1024);
		const file = join(test.home, "only.md");
		writeFileSync(file, longform);
		await run(
			test,
			"note",
			"Solo body",
			"--scope",
			"project:acme/x",
			"--longform",
			file,
		);
		const job = await run(test, "compact", "--scope", "project:acme/x");
		expect(job.code).toBe(0);
		expect(job.out).not.toContain("no merge inputs");
		expect(job.out).toContain("#0-1");
		expect(job.out.match(/SINGLETON-TAIL/g)).toHaveLength(1);
		expect(job.out).toContain(longform);
	});

	it("refuses a compaction of a scope outside the profile", async () => {
		const test = makeEnv(WORK_CONFIG);
		const refused = await run(test, "compact", "--scope", "user:other");
		expect(refused.code).toBe(3);
	});

	it("checks a healthy row store without changing its data", async () => {
		const test = makeEnv(baseConfig("default", '["*"]'));
		await run(test, "note", "Check note", "--scope", "project:acme/x");
		const clean = await run(test, "check");
		expect(clean.code).toBe(0);
		expect(clean.out).toContain("ok");
		const repaired = await run(test, "repair");
		expect(repaired.code).toBe(0);
		expect(repaired.out).toContain("nothing to repair");
		const after = await run(test, "check");
		expect(after.code).toBe(0);
		expect(after.out).toContain("ok");
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

	it("refuses an import under an invalid --as key", async () => {
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
		const second = makeEnv();
		const input = join(second.home, "in.jsonl");
		writeFileSync(
			input,
			readFileSync(join(out, "project%3Aacme%2Fx.jsonl"), "utf8"),
		);
		const refused = await run(
			second,
			"import",
			"--in",
			input,
			"--as",
			"myproject",
		);
		expect(refused.code).toBe(1);
		expect(refused.err).toContain("The scope key is not valid.");
		const found = await run(second, "find", "Move");
		expect(found.out).not.toContain("myproject");
	});
});
