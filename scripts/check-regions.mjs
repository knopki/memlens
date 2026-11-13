/**
 * #region moduleContract
 * @purpose Keep the region markup readable, so a blank line separates each marker from other code.
 * @scope The blank-line discipline of `// #region` and `// #endregion` markers in TypeScript sources.
 * @invariants The line after one region marker is blank or another marker rule holds.
 * @invariants The line before one end marker is blank.
 * @keywords region, marker, blank line, lint, grace
 * #endregion moduleContract
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Collect each TypeScript file of the package sources. */
function sources(root) {
	const files = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		if (statSync(path).isDirectory()) {
			if (entry === "dist" || entry === "node_modules") continue;
			files.push(...sources(path));
		} else if (entry.endsWith(".ts")) files.push(path);
	}
	return files;
}

let violations = 0;
for (const pkg of ["core", "cli", "ui"]) {
	const root = join("packages", pkg, "src");
	let files;
	try {
		files = sources(root);
	} catch {
		continue;
	}
	for (const file of files) {
		const lines = readFileSync(file, "utf8").split("\n");
		lines.forEach((line, index) => {
			const opener = /^\s*\/\/ #region /.test(line);
			const closer = /^\s*\/\/ #endregion /.test(line);
			if (!opener && !closer) return;
			const after = lines[index + 1];
			if (after !== undefined && after.trim() !== "") {
				console.log(
					`${file}:${index + 2}: no blank line after a region marker`,
				);
				violations++;
			}
			if (closer) {
				const before = lines[index - 1];
				if (before !== undefined && before.trim() !== "") {
					console.log(
						`${file}:${index + 1}: no blank line before an end marker`,
					);
					violations++;
				}
			}
		});
	}
}
console.log(
	violations === 0 ? "regions: ok" : `regions: ${violations} violations`,
);
process.exitCode = violations === 0 ? 0 : 1;
