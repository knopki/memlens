/**
 * #region moduleContract
 * @purpose Hold the console store to one snapshot reference, one listener call for each change, and
 * the fields of a patch.
 * @scope The snapshot, the patch, and the subscribers.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { createConsoleStore } from "../../src/model/store.js";
import { stateOf } from "./helpers.js";

describe("console store", () => {
	it("keeps the same snapshot until a change", () => {
		const store = createConsoleStore(stateOf());
		const first = store.getSnapshot();
		expect(store.getSnapshot()).toBe(first);
		store.set({ busy: true });
		expect(store.getSnapshot()).not.toBe(first);
		expect(store.getSnapshot().busy).toBe(true);
	});

	it("calls each listener once for each change", () => {
		const store = createConsoleStore(stateOf());
		let count = 0;
		const stop = store.subscribe(() => {
			count += 1;
		});
		store.set({ busy: true });
		store.set({ busy: false });
		expect(count).toBe(2);
		stop();
		store.set({ busy: true });
		expect(count).toBe(2);
	});

	it("keeps the fields that a patch does not name", () => {
		const store = createConsoleStore(stateOf());
		store.set({ scope: "team:beta" });
		expect(store.getSnapshot()).toMatchObject({
			profile: "default",
			scope: "team:beta",
			limit: "10",
		});
	});
});
