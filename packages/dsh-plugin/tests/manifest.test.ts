/**
 * #region moduleContract
 * @purpose Check the manifest, the patch file, the locales, and the icon that the harness loads.
 * @invariants Each harness dependency mirrors a peer. The entry file exists after the build.
 * #endregion moduleContract
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// The manifest is the contract with the harness. These tests fail on the faults
// that make a plugin load with no error and no effect.

interface Manifest {
	name: string;
	main?: string;
	files?: string[];
	exports?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	dsh?: { manifestVersion?: number; bundle?: { patch?: string } };
}

interface PatchRow {
	id?: string;
	name?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const manifest = JSON.parse(
	readFileSync(join(root, "package.json"), "utf8"),
) as Manifest;

/** Get the harness package names in one dependency table. */
function harnessNames(table: Record<string, string> | undefined): string[] {
	return Object.keys(table ?? {}).filter((name) =>
		name.startsWith("@deepseek-ai/"),
	);
}

describe("plugin manifest", () => {
	it("declares manifest version 1 and the bundle patch file", () => {
		expect(manifest.dsh?.manifestVersion).toBe(1);
		expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
	});

	it("points main to the file that the build writes", () => {
		expect(manifest.main).toBe("lib/index.js");
		// The test script runs the build first, so a missing file is a real fault.
		expect(existsSync(join(root, "lib/index.js"))).toBe(true);
		expect(existsSync(join(root, "lib/index.d.ts"))).toBe(true);
	});

	it("exports the entry, the locale files, and the icon", () => {
		expect(manifest.exports?.["."]).toBe("./lib/index.js");
		expect(manifest.exports?.["./locale/*.json"]).toBeDefined();
		expect(manifest.exports?.["./icon"]).toBeDefined();
	});

	it("ships the entry, the patch, the locales, and the icon", () => {
		for (const item of [
			"lib",
			"cordis.patch.yml",
			"locale/*.json",
			"icon.svg",
		]) {
			expect(manifest.files).toContain(item);
		}
	});

	it("gives display metadata in three languages", () => {
		for (const language of ["en", "ru", "zh"]) {
			const data = JSON.parse(
				readFileSync(join(root, "locale", `${language}.json`), "utf8"),
			) as {
				meta?: { title?: string; description?: string };
			};
			expect(data.meta?.title).toBeTruthy();
			expect(data.meta?.description).toBeTruthy();
		}
	});

	it("keeps the icon below 256 KiB", () => {
		expect(statSync(join(root, "icon.svg")).size).toBeLessThan(256 * 1024);
	});

	it("inserts one bundle row that names this package", () => {
		const patch = parseYaml(
			readFileSync(join(root, "cordis.patch.yml"), "utf8"),
		) as Array<{
			insert?: PatchRow[];
		}>;
		const rows = patch.flatMap((layer) => layer.insert ?? []);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("dsh-memlens");
		expect(rows[0]?.name).toBe(manifest.name);
	});

	it("declares no harness package as a dependency", () => {
		expect(harnessNames(manifest.dependencies)).toEqual([]);
	});

	it("mirrors each harness dev dependency in peer dependencies", () => {
		const peers = Object.keys(manifest.peerDependencies ?? {});
		for (const name of harnessNames(manifest.devDependencies)) {
			expect(peers).toContain(name);
		}
	});
});
