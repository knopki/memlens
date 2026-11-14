/**
 * #region moduleContract
 * @purpose Check the manifest, the patch file, the locales, and the icon that the harness loads.
 * @invariants Each peer dependency has a development mirror. Both entry points exist after the build.
 * @invariants The patch holds the host entry id. The manifest exports the host and the preset paths.
 * #endregion moduleContract
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// The manifest is the contract with the harness. These tests fail on the faults
// that make a plugin load with no error and no effect.

interface ExportTarget {
	types?: string;
	default?: string;
}

interface Manifest {
	name: string;
	main?: string;
	types?: string;
	files?: string[];
	exports?: Record<string, string | ExportTarget>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	engines?: { node?: string; dsh?: string };
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

/** The service packages that the host entry imports at run time. */
const DSH_PEERS: Record<string, string> = {
	"@deepseek-ai/dsh-agent": ">=0.2.1-0 <0.3.0",
	"@deepseek-ai/dsh-llm": ">=0.2.1-0 <0.3.0",
	"@deepseek-ai/dsh-scope": ">=0.2.1-0 <0.3.0",
};

/** Read one export target as an object with the type and the default paths. */
function exportTarget(key: string): ExportTarget {
	const target = manifest.exports?.[key];
	expect(typeof target).toBe("object");
	return target as ExportTarget;
}

/** Read the rows that the patch file inserts. */
function patchRows(): PatchRow[] {
	const patch = parseYaml(
		readFileSync(join(root, "cordis.patch.yml"), "utf8"),
	) as Array<{
		insert?: PatchRow[];
	}>;
	return patch.flatMap((layer) => layer.insert ?? []);
}

describe("plugin manifest", () => {
	it("declares manifest version 1 and the bundle patch file", () => {
		expect(manifest.dsh?.manifestVersion).toBe(1);
		expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
	});

	it("points main to the host entry that the build writes", () => {
		expect(manifest.main).toBe("lib/index.js");
		expect(manifest.types).toBe("lib/index.d.ts");
		// The test script runs the build first, so a missing file is a real fault.
		expect(existsSync(join(root, "lib/index.js"))).toBe(true);
		expect(existsSync(join(root, "lib/index.d.ts"))).toBe(true);
	});

	it("exports the host entry with a type path and a default path", () => {
		expect(exportTarget(".")).toEqual({
			types: "./lib/index.d.ts",
			default: "./lib/index.js",
		});
	});

	it("exports the preset entry with a type path and a default path", () => {
		expect(exportTarget("./preset")).toEqual({
			types: "./lib/preset.d.ts",
			default: "./lib/preset.js",
		});
		expect(existsSync(join(root, "lib/preset.js"))).toBe(true);
		expect(existsSync(join(root, "lib/preset.d.ts"))).toBe(true);
	});

	it("exports the locale files and the icon", () => {
		expect(manifest.exports?.["./locale/*.json"]).toBeDefined();
		expect(manifest.exports?.["./icon"]).toBeDefined();
	});

	it("ships the entries, the patch, the locales, and the icon", () => {
		for (const item of [
			"lib",
			"cordis.patch.yml",
			"locale/*.json",
			"icon.svg",
		]) {
			expect(manifest.files).toContain(item);
		}
	});

	it("gives display metadata in eight languages", () => {
		for (const language of ["de", "en", "es", "fr", "ja", "pt", "ru", "zh"]) {
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

	it("inserts one host row that names this package", () => {
		const rows = patchRows();

		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("memlens");
		expect(rows[0]?.name).toBe(manifest.name);
	});

	it("depends on the workspace library and the schema package", () => {
		expect(manifest.dependencies?.["@memlens/core"]).toBe("workspace:*");
		expect(manifest.dependencies?.["@deepseek-ai/schemastery"]).toBe("^3.18.2");
		for (const name of Object.keys(manifest.dependencies ?? {})) {
			expect(name.startsWith("@deepseek-ai/dsh-")).toBe(false);
		}
	});

	it("mirrors each host peer in the development dependencies", () => {
		expect(manifest.peerDependencies?.["@deepseek-ai/cordis"]).toBe("^4.0.2");
		expect(manifest.devDependencies?.["@deepseek-ai/cordis"]).toBe("4.1.0");

		for (const [name, range] of Object.entries(DSH_PEERS)) {
			expect(manifest.peerDependencies?.[name]).toBe(range);
			expect(manifest.devDependencies?.[name]).toBe("0.2.2-rc.3");
		}
	});

	it("keeps the loader as a development dependency only", () => {
		expect(
			manifest.devDependencies?.["@deepseek-ai/cordis-plugin-loader"],
		).toBe("^1.1.0");
		expect(
			manifest.peerDependencies?.["@deepseek-ai/cordis-plugin-loader"],
		).toBe(undefined);
	});

	it("removes the unused tool scaffold dependency", () => {
		expect(
			manifest.devDependencies?.["@deepseek-ai/dsh-tools"],
		).toBeUndefined();
		expect(
			manifest.peerDependencies?.["@deepseek-ai/dsh-tools"],
		).toBeUndefined();
	});

	it("supports DeepSeek Harness 0.2.1 and later", () => {
		expect(manifest.engines?.dsh).toBe(">=0.2.1-0");
		expect(manifest.engines?.node).toBeTruthy();
	});
});
