/**
 * #region moduleContract
 * @purpose Keep the semantic markup and the blank-line layout of the sources readable.
 * @scope
 *  - The module contract of each source file.
 *  - The files of one call, so a hook checks the staged files only.
 *  - The pairing and the name of each region marker.
 *  - The place of each contract: a contract stands inside a region pair.
 *  - The blank lines around a marker, a doc comment, and a top-level declaration.
 *  - NOT: the code style inside a construct.
 * @invariants
 *  - A region marker touches its own entity and no blank line stands inside the pair.
 *  - A doc block with `@purpose` stands inside a region pair, and the module contract is the one
 *    block that carries its own region.
 *  - A blank line separates each construct from its neighbor.
 * @keywords region, marker, blank line, lint, grace, layout
 * #endregion moduleContract
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = ["core", "cli", "ui", "dsh-plugin"];
const REGION = /^\s*\/\/ #(region|endregion) (\w+)/;
const DECLARATION =
	/^(export )?(async )?(function|const|let|type|interface|class|declare)\b/;
const CONTINUES = /[=(,[{|&+:>]$/;

/** Collect each TypeScript file of a source root. */
function sources(root) {
	const files = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		if (statSync(path).isDirectory()) {
			if (entry === "node_modules" || entry === "dist" || entry === "lib") {
				continue;
			}
			files.push(...sources(path));
		} else if (
			(entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
			!entry.endsWith(".d.ts")
		) {
			files.push(path);
		}
	}
	return files;
}

/** Report each layout fault of one file. */
function inspect(file) {
	const lines = readFileSync(file, "utf8").split("\n");
	const faults = [];
	const add = (index, message) =>
		faults.push(`${file}:${index + 1}: ${message}`);
	const blank = (index) =>
		index < 0 || index >= lines.length || lines[index].trim() === "";
	const open = [];

	lines.forEach((line, index) => {
		const text = line.trim();
		const marker = REGION.exec(line);
		if (marker) {
			const [, kind, name] = marker;
			if (kind === "region") {
				open.push(name);
				if (!blank(index - 1) && !lines[index - 1].trim().endsWith("*/")) {
					add(index, `no blank line before the region ${name}`);
				}
				if (blank(index + 1))
					add(index, `blank line inside the region ${name}`);
			} else {
				const expected = open.pop();
				if (expected !== name) {
					add(index, `unpaired marker ${name}, expected ${expected ?? "none"}`);
				}
				if (blank(index - 1))
					add(index, `blank line inside the region ${name}`);
				if (!blank(index + 1) && lines[index + 1].trim() !== "}") {
					add(index, `no blank line after the end marker ${name}`);
				}
			}
			return;
		}
		if (text.startsWith("/**") && !blank(index - 1)) {
			const before = lines[index - 1].trim();
			if (
				before !== "" &&
				!before.endsWith("{") &&
				!before.startsWith("// #region")
			) {
				add(index, "no blank line before a doc comment");
			}
		}
		if (index === 0 || !DECLARATION.test(line)) return;
		const before = lines[index - 1].trim();
		if (before === "" || before.endsWith("*/") || before.startsWith("//"))
			return;
		if (CONTINUES.test(before)) return;
		add(index, "no blank line before a top-level declaration");
	});

	if (open.length > 0) add(lines.length, `unclosed region ${open.join(", ")}`);

	const inside = new Array(lines.length).fill(false);
	let depth = 0;
	lines.forEach((line, index) => {
		const marker = REGION.exec(line);
		if (marker) {
			inside[index] = true;
			depth += marker[1] === "region" ? 1 : -1;
			return;
		}
		inside[index] = depth > 0;
	});
	for (let index = 0; index < lines.length; index++) {
		if (!lines[index].trim().startsWith("/**")) continue;
		let end = index;
		while (end < lines.length && !lines[end].includes("*/")) end += 1;
		const block = lines.slice(index, end + 1).join("\n");
		if (block.includes("#region moduleContract")) {
			index = end;
			continue;
		}
		if (block.includes("@purpose") && !inside[index])
			add(index, "a contract stands outside a region");
		index = end;
	}
	const first = lines.findIndex((line) => DECLARATION.test(line));
	const head = lines.slice(0, first === -1 ? lines.length : first).join("\n");
	if (!head.includes("#region moduleContract")) add(0, "no module contract");
	else if (!head.includes("@purpose"))
		add(0, "no purpose in the module contract");
	return faults;
}

const given = process.argv
	.slice(2)
	.filter(
		(path) =>
			(path.endsWith(".ts") || path.endsWith(".tsx")) &&
			!path.endsWith(".d.ts"),
	);
const checked = given.length > 0 ? given : [];
if (given.length === 0) {
	for (const pkg of PACKAGES) {
		for (const dir of ["src", "tests"]) {
			try {
				checked.push(...sources(join("packages", pkg, dir)));
			} catch {
				// The package holds no such directory.
			}
		}
	}
}

let violations = 0;
for (const file of checked) {
	if (!existsSync(file)) continue;
	for (const fault of inspect(file)) {
		console.log(fault);
		violations++;
	}
}
console.log(
	violations === 0 ? "regions: ok" : `regions: ${violations} violations`,
);
process.exitCode = violations === 0 ? 0 : 1;
