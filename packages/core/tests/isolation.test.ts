/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove that the library imports no frontend, plugin, or harness package.
 * #endregion moduleContract
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The library must not know the CLI, the plugin, or a user interface.
// These prefixes mark the packages that only a frontend may import.
const forbidden = [
	"@memlens/cli",
	"@memlens/dsh-plugin",
	"@deepseek-ai/",
	"react",
	"react-dom",
	"vue",
	"solid-js",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** List the source files below one directory. */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			return sourceFiles(path);
		}

		return entry.name.endsWith(".ts") ? [path] : [];
	});
}

describe("library isolation", () => {
	it("exports no legacy event API", async () => {
		const entry = await import("../src/index.js");
		expect("project" in entry).toBe(false);
		expect("replay" in entry).toBe(false);
		expect("invalidate" in entry).toBe(false);
	});

	it("has no storage directory", () => {
		expect(existsSync(join(root, "storage"))).toBe(false);
	});

	it("keeps store imports limited to pure domain helpers", () => {
		const allowed = new Set([
			"../domain/address.js",
			"../domain/note-body.js",
			"../domain/scope.js",
			"../domain/time.js",
			"../domain/tree.js",
			"../domain/ulid.js",
		]);
		for (const file of sourceFiles(join(root, "store"))) {
			const text = readFileSync(file, "utf8");
			for (const match of text.matchAll(/from\s+["']([^"']+)['"]/g)) {
				const name = match[1] ?? "";
				if (name.startsWith("../domain/")) {
					expect(allowed.has(name), `${file} imports ${name}`).toBe(true);
				}
			}
		}
	});

	it("imports no frontend, plugin, or harness package", () => {
		for (const file of sourceFiles(root)) {
			const text = readFileSync(file, "utf8");

			for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
				const name = match[1] ?? "";
				const found = forbidden.some((prefix) => name.startsWith(prefix));

				expect(found, `${file} imports ${name}`).toBe(false);
			}
		}
	});
});
