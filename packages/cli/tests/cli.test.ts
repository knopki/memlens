/**
 * CLI entry tests.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the dispatch, the help, and the exit codes of the binary, so the usage rules hold.
 * @scope The help text, the short flags, and the exit code mapping. NOT: the command behavior.
 * @invariants An unknown command and no command give the exit code 2. The help and the version give
 *   the exit code 0. A short flag has one meaning in each command.
 * @keywords cli, test, usage, help, version, exit code
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

/** The answer of one run: the exit code and the captured answer and error streams. */
interface Answer {
	readonly code: number;
	readonly out: string;
	readonly err: string;
}

/** Run one command line, capture both streams, and keep them intact. */
async function run(...argv: string[]): Promise<Answer> {
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
		const code = await main(argv);
		return { code, out, err };
	} finally {
		process.stdout.write = outWrite;
		process.stderr.write = errWrite;
	}
}

/** Give each command name of one root help, in its order and without the help command. */
function commandNames(help: string): string[] {
	const lines = help.split("\n");
	const start = lines.findIndex((line) => line.trim() === "Commands:") + 1;
	const names: string[] = [];
	for (const line of lines.slice(start)) {
		if (line.trim() === "") break;
		const name = /^ {2}(\S+)/.exec(line)?.[1] ?? "";
		if (name !== "" && name !== "help") names.push(name);
	}
	return names;
}

describe("@memlens/cli entry", () => {
	it("gives the exit code 2 without a command", async () => {
		expect(await main([])).toBe(2);
	});

	it("gives the exit code 2 for an unknown command", async () => {
		expect(await main(["nope"])).toBe(2);
	});

	it("gives the exit code 2 for a flag outside the usage", async () => {
		expect(await main(["scopes", "--wrong"])).toBe(2);
	});

	it("gives the help of the binary and the version with the exit code 0", async () => {
		const help = await run("--help");
		expect(help.code).toBe(0);
		expect(help.out).toContain("Usage: memlens [options] [command]");
		expect(help.err).toBe("");
		const version = await run("--version");
		const manifest = JSON.parse(
			readFileSync(new URL("../package.json", import.meta.url), "utf8"),
		) as { version: string };
		expect(version.code).toBe(0);
		expect(version.out).toBe(`${manifest.version}\n`);
	});

	it("gives the help of each command with --help", async () => {
		const names = commandNames((await run("--help")).out);
		expect(names.length).toBeGreaterThan(10);
		for (const name of names) {
			const answer = await run(name, "--help");
			expect(answer.code, `${name} --help failed`).toBe(0);
			expect(answer.out).toContain(`Usage: memlens ${name}`);
		}
	});

	it("gives one meaning to each short flag", async () => {
		const bindings = new Map<string, string>();
		for (const name of commandNames((await run("--help")).out)) {
			const help = await run(name, "--help");
			for (const [, short, long] of help.out.matchAll(
				/-([a-z]), (--[\w-]+)/g,
			)) {
				expect(bindings.get(short) ?? long, `${name} -${short}`).toBe(long);
				bindings.set(short, long);
			}
		}
		expect([...bindings.keys()].sort().join("")).toBe("fhkloprsy");
	});
});
