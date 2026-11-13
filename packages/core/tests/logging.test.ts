/**
 * #region moduleContract
 * @purpose Check that store logs expose results without note content.
 * #endregion moduleContract
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

const { logs } = vi.hoisted(() => ({ logs: [] as unknown[][] }));
vi.mock("node:util", async (original) => ({
	...(await original<typeof import("node:util")>()),
	debuglog:
		(namespace: string) =>
		(...data: unknown[]) =>
			logs.push([namespace, ...data]),
}));

import { note } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import { loadView, sliceOf } from "../src/store/view.js";

it("logs store writes and views without note content", () => {
	logs.length = 0;
	const directory = mkdtempSync(join(tmpdir(), "memlens-logs-"));
	const store = new Store(directory);
	try {
		note(store, {
			scope: "project:a",
			body: "PRIVATE_NOTE_CONTENT",
			longform: "PRIVATE_DOCUMENT_CONTENT",
			kind: "note",
			session: "s",
			turn: "t",
			preset: "p",
		});
		expect(sliceOf(loadView(store.handle(), "project:a"), 1)).toHaveLength(1);
		expect(logs.some((entry) => entry[1] === "Note write")).toBe(true);
		expect(logs.some((entry) => entry[1] === "Publish")).toBe(true);
		expect(logs.some((entry) => entry[1] === "View sliced")).toBe(true);
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_NOTE_CONTENT");
		expect(JSON.stringify(logs)).not.toContain("PRIVATE_DOCUMENT_CONTENT");
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
