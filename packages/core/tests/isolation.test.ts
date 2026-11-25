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
			"../domain/address-form.js",
			"../domain/address.js",
			"../domain/date-span.js",
			"../domain/note-body.js",
			"../domain/scope.js",
			"../domain/time.js",
			"../domain/tree.js",
			"../domain/ulid.js",
		]);
		for (const file of sourceFiles(join(root, "store"))) {
			const text = readFileSync(file, "utf8");
			// A type-only import is erased at build, so it couples no runtime.
			for (const match of text.matchAll(
				/import\s+(type\s+)?[^"']*?from\s+["']([^"']+)["']/g,
			)) {
				const typeOnly = match[1] !== undefined;
				const name = match[2] ?? "";
				if (!typeOnly && name.startsWith("../domain/")) {
					expect(allowed.has(name), `${file} imports ${name}`).toBe(true);
				}
			}
		}
	});

	it("keeps store queries out of the domain", () => {
		// A statement start inside a literal marks SQL. A regular expression keeps its own exec.
		const statement =
			/["'`]\s*(?:SELECT\s|INSERT\s+INTO\s|PRAGMA\s|CREATE\s+TABLE\s|DROP\s+TABLE\s|DELETE\s+FROM\s|UPDATE\s+\w+\s+SET\s)/i;
		for (const file of sourceFiles(join(root, "domain"))) {
			const text = readFileSync(file, "utf8");
			expect(text, `${file} names node:sqlite`).not.toMatch(
				/["']node:sqlite["']/,
			);
			expect(text, `${file} prepares a statement`).not.toMatch(
				/\.prepare\s*\(/,
			);
			expect(text, `${file} runs SQL on the handle`).not.toMatch(
				/handle\(\)\s*\.exec\s*\(|\bdb\.exec\s*\(/,
			);
			expect(text, `${file} holds a SQL statement`).not.toMatch(statement);
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
