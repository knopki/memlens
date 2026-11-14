/**
 * #region moduleContract
 * @purpose Check the built client artifact against the contract of the harness module table.
 * @scope The registration id, the plugin exports, the required module names, and the real zod of the
 *   page.
 * NOT: the tab body and the host service.
 * @invariants The artifact registers the package name and returns an apply function.
 * @invariants Each required module name belongs to the baseline table of the page.
 * @invariants The factory reads the schema builder of the Remote contribution, so the test gives the
 *   real zod module, as the page does.
 * @keywords client, artifact, bundle, module, table, test, zod
 * #endregion moduleContract
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/** The baseline module names of the harness page. Source: the shipped Web shell. */
const BASELINE = new Set([
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"zod",
]);

/** The module table of the page, as the artifact reads it: the real zod and a stub React. */
const requireFromPage = createRequire(import.meta.url);

/** The real zod module of the page. */
const zod: unknown = requireFromPage("zod");

/** The React stub of the page. Each element is a marker, so no node is needed. */
const reactStub = {
	createElement: () => null,
	jsx: () => null,
	jsxs: () => null,
	Fragment: "fragment",
};

interface Registration {
	readonly id: string;
	readonly factory: (require: (name: string) => unknown) => unknown;
}

// #region FUNC_loadArtifact
/**
 * @purpose Run the classic script in an isolated page and collect its registration.
 * @returns The one registration that the artifact submits.
 */
async function loadArtifact(): Promise<Registration> {
	const code = await readFile(
		new URL("../lib/client.js", import.meta.url),
		"utf8",
	);
	let registration: Registration | undefined;
	const sandbox = {
		window: {
			__ModuleLoader__: {
				load(value: Registration) {
					registration = value;
				},
			},
		},
		console,
	};
	vm.runInNewContext(code, sandbox);
	if (registration === undefined)
		throw new Error("The artifact registers no factory.");
	return registration;
}
// #endregion FUNC_loadArtifact

// #region FUNC_pageTable
/**
 * @purpose Give the module table of the page and collect each requested name.
 * @param required - The list that receives each module name.
 */
function pageTable(required: string[]): (name: string) => unknown {
	return (name) => {
		required.push(name);
		if (name === "zod") return zod;
		return reactStub;
	};
}
// #endregion FUNC_pageTable

describe("client artifact", () => {
	it("registers the package name", async () => {
		expect((await loadArtifact()).id).toBe("@memlens/dsh-plugin");
	});

	it("returns the plugin exports", async () => {
		const registration = await loadArtifact();
		const required: string[] = [];
		const exports = registration.factory(pageTable(required)) as {
			apply?: unknown;
			inject?: unknown;
		};
		expect(typeof exports.apply).toBe("function");
		expect(exports.inject).toEqual(["slots", "locale", "remote"]);
		expect(required.length).toBeGreaterThan(0);
		expect(required).toContain("zod");
	});

	it("requires no module outside the baseline table", async () => {
		const registration = await loadArtifact();
		const required: string[] = [];
		const foreign: string[] = [];
		registration.factory((name) => {
			if (!BASELINE.has(name)) foreign.push(name);
			return pageTable(required)(name);
		});
		expect(foreign).toEqual([]);
	});
});
