/**
 * Transfer commands.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Move the memory between stores and give a readable copy, so a user keeps a backup or
 *   merges one store into another.
 * @scope
 *  - The commands export and import.
 *  - NOT: the Markdown format and the store rules.
 * @usecases
 *  - Export: user => gives a format and a directory => gets one written file for each scope
 * @dependencies USES API: @memlens/core, commander; WRITES: the export directory
 * @keywords export, import, markdown, jsonl, transfer, cli
 * #endregion moduleContract
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { debuglog } from "node:util";
import type { ScopeKey } from "@memlens/core";
import {
	exportLines,
	importLines,
	MemlensError,
	normalizeScopeKey,
	scopeNotes,
} from "@memlens/core";
import type { Command } from "commander";
import {
	type CommandIo,
	command,
	DRY_RUN,
	oneOf,
	openCommandRuntime,
	type Run,
	readInputText,
	reply,
	SCOPE,
	STORE,
} from "./commands.js";
import { encodeScopeFilename, renderScopeMarkdown } from "./export-md.js";

const debug = debuglog("memlens:commands");

// #region FUNC_commands
/**
 * @purpose Declare the signature and the flags of each transfer command once, so the help comes
 *   from the same place as the parse.
 */
export function commands(run: Run): Command[] {
	const io = run.io;
	return [
		command("export", "Export the store to files.")
			.requiredOption(
				"-f, --format <format>",
				"The format of the files: md or jsonl.",
				oneOf(["md", "jsonl"]),
			)
			.requiredOption("-o, --out <dir>", "The directory of the files.")
			.addOption(SCOPE)
			.addOption(STORE)
			.action((options) => reply(run, exportCommand(options, io))),
		command("import", "Import notes from one JSONL file.")
			.requiredOption("--in <path>", "The path of the file.")
			.option(
				"--as <key>",
				"The scope key that replaces the scope of each imported note.",
			)
			.addOption(DRY_RUN)
			.addOption(STORE)
			.action((options) => reply(run, importCommand(options, io))),
	];
}
// #endregion FUNC_commands

// #region FUNC_exportCommand
/**
 * Export the store to files.
 *
 * @purpose Write one md file for each scope, or the jsonl transfer copy, so a user keeps a
 *   readable view or moves a store.
 * @invariants The flags --format and --out are required. With no --scope, the md format writes one
 *   file for each visible scope, and the jsonl format copies the whole store. The jsonl copy of one
 *   scope also holds the top node of that scope.
 */
export async function exportCommand(
	input: {
		format: "md" | "jsonl";
		out: string;
		scope?: string;
		store?: string;
	},
	io: CommandIo,
): Promise<string> {
	const scope =
		input.scope === undefined
			? null
			: (normalizeScopeKey(input.scope) as ScopeKey);
	const runtime = await openCommandRuntime(io, input.store);
	try {
		mkdirSync(input.out, { recursive: true });
		const written: string[] = [];
		if (input.format === "jsonl") {
			const lines = exportLines(runtime.store, scope);
			const name =
				scope === null ? "memlens.jsonl" : `${encodeStem(scope)}.jsonl`;
			writeFileSync(join(input.out, name), `${lines.join("\n")}\n`);
			written.push(`${name} (${lines.length} rows)`);
		} else {
			const scopes = scope === null ? runtime.scopes : [scope];
			for (const key of scopes) {
				const records = scopeNotes(runtime.store, key);
				const name = encodeScopeFilename(key);
				writeFileSync(join(input.out, name), renderScopeMarkdown(key, records));
				written.push(`${name} (${records.length} records)`);
			}
		}
		debug("Export written", {
			event: "export",
			format: input.format,
			files: written.length,
		});
		return written.map((line) => `wrote ${line}`).join("\n");
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_exportCommand

function encodeStem(scope: ScopeKey): string {
	return encodeScopeFilename(scope).slice(0, -".md".length);
}

// #region FUNC_importCommand
/**
 * Import notes from one JSONL file.
 *
 * @purpose Join the notes of one file into the store by id, so a user moves or merges a store.
 * @invariants The import joins by id and applies the erasure evidence of both sides. The flag
 *   --dry-run validates and counts the change and writes nothing. The flag --as rewrites the scope
 *   of each imported note.
 */
export async function importCommand(
	input: { in: string; as?: string; dryRun?: boolean; store?: string },
	io: CommandIo,
): Promise<string> {
	const as =
		input.as === undefined ? null : (normalizeScopeKey(input.as) as ScopeKey);
	const incoming = readLines(input.in);
	const runtime = await openCommandRuntime(io, input.store);
	try {
		const dryRun = input.dryRun === true;
		const result = importLines(runtime.store, [...incoming], {
			dryRun,
			...(as === null ? {} : { as }),
		});
		const changed = result.applied + result.merged;
		debug("Import done", { event: "import", changed });
		return dryRun
			? `would import ${changed} notes`
			: `imported ${changed} notes`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_importCommand

function readLines(path: string): readonly string[] {
	return readInputText(path)
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => {
			try {
				JSON.parse(line);
				return line;
			} catch {
				throw new MemlensError("Data", `The file ${path} holds a bad line.`);
			}
		});
}
