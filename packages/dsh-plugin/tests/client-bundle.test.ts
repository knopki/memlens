/**
 * #region moduleContract
 * @purpose Check the built client artifact against the contract of the harness module table.
 * @scope The registration id, the plugin exports, and the required module names.
 * NOT: the tab body and the host route.
 * @invariants The artifact registers the package name and returns an apply function.
 * @invariants Each required module name belongs to the baseline table of the page.
 * @keywords client, artifact, bundle, module, table, test
 * #endregion moduleContract
 */

import { readFile } from "node:fs/promises";
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

describe("client artifact", () => {
	it("registers the package name", async () => {
		expect((await loadArtifact()).id).toBe("@memlens/dsh-plugin");
	});

	it("returns the plugin exports", async () => {
		const registration = await loadArtifact();
		const required: string[] = [];
		const exports = registration.factory((name) => {
			required.push(name);
			return name === "react" || name === "react/jsx-runtime"
				? {
						createElement: () => null,
						jsx: () => null,
						jsxs: () => null,
						Fragment: "fragment",
					}
				: {};
		}) as { apply?: unknown; inject?: unknown };
		expect(typeof exports.apply).toBe("function");
		expect(exports.inject).toEqual(["slots", "locale"]);
		expect(required.length).toBeGreaterThan(0);
	});

	it("requires no module outside the baseline table", async () => {
		const registration = await loadArtifact();
		const foreign: string[] = [];
		registration.factory((name) => {
			if (!BASELINE.has(name)) foreign.push(name);
			return {};
		});
		expect(foreign).toEqual([]);
	});
});
