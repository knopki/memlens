/**
 * #region moduleContract
 * @purpose Hold the standalone storage to its fallback, so a blocked browser storage keeps the
 * console usable and throws no error.
 * @scope The read of a blocked storage, the read of a stored value, and the write.
 * @invariants Each test supplies its own storage object.
 * @dependencies USES: the storage adapter.
 * @keywords test, storage, fallback, blocked, language, theme
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalStorage } from "../../src/standalone/storage.js";

/** One storage object that throws on each call, as a blocked browser storage does. */
const BLOCKED = {
	getItem(): string {
		throw new Error("The storage is blocked.");
	},
	setItem(): void {
		throw new Error("The storage is blocked.");
	},
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("standalone storage", () => {
	it("gives the fallback when the browser blocks the storage", () => {
		vi.stubGlobal("localStorage", BLOCKED);
		const storage = createLocalStorage();

		expect(storage.read("memlens.lang", "en")).toBe("en");
		expect(storage.read("memlens.theme", "system")).toBe("system");
		expect(() => {
			storage.write("memlens.lang", "ru");
		}).not.toThrow();
	});

	it("gives a stored value and keeps a written value", () => {
		const kept = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => {
				kept.set(key, value);
			},
		});
		const storage = createLocalStorage();
		storage.write("memlens.lang", "ru");

		expect(storage.read("memlens.lang", "en")).toBe("ru");
		expect(storage.read("memlens.theme", "system")).toBe("system");
	});
});
