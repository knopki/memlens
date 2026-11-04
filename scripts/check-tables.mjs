#!/usr/bin/env node
// Check that each markdown table renders: a header line, a separator line, and
// the same number of cells in each row. A table that lost its header renders as
// plain text, which no other check sees.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["README.md", "AGENTS.md", "docs"];

/** List the markdown files below one path. */
function files(path) {
	if (statSync(path).isDirectory()) {
		return readdirSync(path).flatMap((name) => files(join(path, name)));
	}

	return path.endsWith(".md") ? [path] : [];
}

/** Count the cells of one table line. An escaped pipe belongs to the text. */
function cells(line) {
	const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	let count = 1;

	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "\\") {
			i += 1;
		} else if (text[i] === "|") {
			count += 1;
		}
	}

	return count;
}

/** Tell whether a line is the separator line of a table. */
function isSeparator(line) {
	return line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

let faults = 0;

/** Report the faults of one table block. */
function report(file, start, block) {
	if (block.length === 0) {
		return;
	}

	if (block.length < 2 || !isSeparator(block[1])) {
		console.error(`${file}:${start}: the table has no header and separator`);
		faults += 1;
		return;
	}

	const width = cells(block[0]);

	for (let i = 2; i < block.length; i += 1) {
		const found = cells(block[i]);

		if (found !== width) {
			console.error(
				`${file}:${start + i}: ${found} cells, the header has ${width}`,
			);
			faults += 1;
		}
	}
}

for (const file of roots.flatMap(files)) {
	const lines = readFileSync(file, "utf8").split("\n");
	let block = [];
	let blockStart = 0;

	for (const [index, line] of lines.entries()) {
		if (line.trimStart().startsWith("|")) {
			if (block.length === 0) {
				blockStart = index + 1;
			}

			block.push(line);
			continue;
		}

		report(file, blockStart, block);
		block = [];
	}

	report(file, blockStart, block);
}

if (faults > 0) {
	console.error(`${faults} table fault(s)`);
	process.exit(1);
}

console.log("tables: ok");
