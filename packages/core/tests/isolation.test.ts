import { readdirSync, readFileSync } from "node:fs";
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
