/**
 * #region moduleContract
 * @purpose Keep the semantic markup and the blank-line layout of the sources readable.
 * @scope
 *  - The module contract of each source file.
 *  - The pairing and the name of each region marker.
 *  - The blank lines around a marker, a doc comment, and a top-level declaration.
 *  - NOT: the code style inside a construct.
 * @invariants
 *  - A region marker touches its own entity and no blank line stands inside the pair.
 *  - A blank line separates each construct from its neighbor.
 * @keywords region, marker, blank line, lint, grace, layout
 * #endregion moduleContract
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
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
		} else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
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
	const first = lines.findIndex((line) => DECLARATION.test(line));
	const head = lines.slice(0, first === -1 ? lines.length : first).join("\n");
	if (!head.includes("#region moduleContract")) add(0, "no module contract");
	else if (!head.includes("@purpose"))
		add(0, "no purpose in the module contract");
	return faults;
}

let violations = 0;
for (const pkg of PACKAGES) {
	for (const dir of ["src", "tests"]) {
		let files;
		try {
			files = sources(join("packages", pkg, dir));
		} catch {
			continue;
		}
		for (const file of files) {
			const faults = inspect(file);
			for (const fault of faults) {
				console.log(fault);
				violations++;
			}
		}
	}
}
console.log(
	violations === 0 ? "regions: ok" : `regions: ${violations} violations`,
);
process.exitCode = violations === 0 ? 0 : 1;
