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
 * @dependencies USES API: @memlens/core; WRITES: the export directory
 * @keywords export, import, markdown, jsonl, transfer, cli
 * #endregion moduleContract
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import type { ParsedArgs } from "./args.js";
import { type CommandIo, flagValue, openCommandRuntime } from "./commands.js";
import { encodeScopeFilename, renderScopeMarkdown } from "./export-md.js";

const debug = debuglog("memlens:commands");

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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const format = flagValue(args.flags, "format");
	const out = flagValue(args.flags, "out");
	if (format === null || (format !== "md" && format !== "jsonl"))
		throw new MemlensError("Usage", "The flag --format needs md or jsonl.");
	if (out === null) throw new MemlensError("Usage", "The command needs --out.");
	const scopeRaw = flagValue(args.flags, "scope");
	const scope =
		scopeRaw === null ? null : (normalizeScopeKey(scopeRaw) as ScopeKey);
	const runtime = await openCommandRuntime(args, io);
	try {
		mkdirSync(out, { recursive: true });
		const written: string[] = [];
		if (format === "jsonl") {
			const lines = exportLines(runtime.store, scope);
			const name =
				scope === null ? "memlens.jsonl" : `${encodeStem(scope)}.jsonl`;
			writeFileSync(join(out, name), `${lines.join("\n")}\n`);
			written.push(`${name} (${lines.length} rows)`);
		} else {
			const scopes = scope === null ? runtime.scopes : [scope];
			for (const key of scopes) {
				const records = scopeNotes(runtime.store, key);
				const name = encodeScopeFilename(key);
				writeFileSync(join(out, name), renderScopeMarkdown(key, records));
				written.push(`${name} (${records.length} records)`);
			}
		}
		debug("Export written", { event: "export", format, files: written.length });
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
	args: ParsedArgs,
	io: CommandIo,
): Promise<string> {
	const input = flagValue(args.flags, "in");
	if (input === null)
		throw new MemlensError("Usage", "The command needs --in.");
	const asRaw = flagValue(args.flags, "as");
	const as = asRaw === null ? null : (normalizeScopeKey(asRaw) as ScopeKey);
	const incoming = readLines(input);
	const runtime = await openCommandRuntime(args, io);
	try {
		const result = importLines(runtime.store, [...incoming], {
			dryRun: args.flags["dry-run"] === true,
			...(as === null ? {} : { as }),
		});
		const changed = result.applied + result.merged;
		debug("Import done", { event: "import", changed });
		return args.flags["dry-run"] === true
			? `would import ${changed} notes`
			: `imported ${changed} notes`;
	} finally {
		await runtime.close();
	}
}
// #endregion FUNC_importCommand

function readLines(path: string): readonly string[] {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
	return text
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
