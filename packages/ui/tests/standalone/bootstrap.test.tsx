/**
 * #region moduleContract
 * @vitest-environment happy-dom
 * @purpose Prove that the standalone entry mounts the console in the page node that carries the
 * class of the shared surface, so one stylesheet scoped under `.ml-console` reaches the console.
 * @scope The mount node, the class of that node, and the render call of the entry.
 * @invariants The test imports the real entry. It stubs the root renderer and the HTTP port only.
 * @dependencies USES: React, the entry, and happy-dom.
 * @keywords test, bootstrap, entry, mount, root, class, standalone, happy-dom
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { viewOf } from "../model/helpers.js";

/** The mount node and the render call that the entry makes. */
const entry: { mount?: HTMLElement; classed?: boolean; rendered: unknown[] } = {
	rendered: [],
};

vi.mock("react-dom/client", () => ({
	createRoot: (mount: HTMLElement) => {
		entry.mount = mount;
		entry.classed = mount.classList.contains("ml-console");
		return {
			render: (node: unknown) => {
				entry.rendered.push(node);
			},
			unmount: () => {},
		};
	},
}));

vi.mock("../../src/model/transport.js", () => ({
	createHttpPort: () => ({
		view: async () => viewOf(),
		search: async () => [],
		open: async () => ({ kind: "record", target: "a#1" }),
		catalog: async () => [],
		action: async () => ({}),
	}),
}));

afterEach(() => {
	document.body.replaceChildren();
	delete document.documentElement.dataset.theme;
	entry.mount = undefined;
	entry.classed = undefined;
	entry.rendered.length = 0;
});

describe("standalone entry", () => {
	it("mounts the console in the node that carries the surface class", async () => {
		const mount = document.createElement("div");
		mount.id = "app";
		document.body.append(mount);

		await import("../../src/standalone/main.js");

		expect(entry.mount).toBe(mount);
		expect(entry.classed).toBe(true);
		expect(entry.rendered).toHaveLength(1);
	});
});
