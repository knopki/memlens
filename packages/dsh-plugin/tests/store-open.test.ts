/**
 * #region moduleContract
 * @purpose Prove the host service starts and answers while the store is not open, and that one
 * bounded retry opens the store later.
 * @scope The store boundary, the first failure, the retry delays, the success, and the disposal.
 * @invariants The test replaces the store boundary only. The service, its configuration, and its
 *   disposal are real.
 * @dependencies @deepseek-ai/cordis, @memlens/core, ../src/service.ts
 * @keywords test, store, open, retry, backoff, lock, disposal
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #region VAR_boundary
/** The store boundary of the test: the attempt count and the error of the next attempt. */
const boundary = vi.hoisted(() => ({
	attempts: 0,
	fail: null as null | (() => Error),
}));
// #endregion VAR_boundary

vi.mock("@memlens/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@memlens/core")>();

	// #region CLASS_BoundaryStore
	/** @purpose Refuse or open the store, so the test controls each attempt at the boundary. */
	class BoundaryStore extends actual.Store {
		constructor(directory: string, language = "en") {
			boundary.attempts += 1;
			const error = boundary.fail?.();
			if (error) throw error;
			super(directory, language);
		}
	}
	// #endregion CLASS_BoundaryStore

	return { ...actual, Store: BoundaryStore };
});

import { Memlens } from "../src/service.js";

const roots: Context[] = [];

const directories: string[] = [];

beforeEach(() => {
	boundary.attempts = 0;
	boundary.fail = null;
});

afterEach(async () => {
	for (const root of roots.splice(0)) await root.fiber.dispose();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

// #region FUNC_harness
/**
 * @purpose Build one host service under temporary configuration roots.
 * @invariants The fake timers run before the constructor, so the test advances each retry.
 */
function harness(): { root: Context; host: Memlens } {
	const directory = mkdtempSync(join(tmpdir(), "memlens-open-"));
	directories.push(directory);
	vi.stubEnv("XDG_CONFIG_HOME", join(directory, "config"));
	vi.stubEnv("XDG_DATA_HOME", join(directory, "data"));
	vi.stubEnv("MEMLENS_STORE", join(directory, "store"));
	const root = new Context();
	roots.push(root);
	return { root, host: new Memlens(root, {}) };
}
// #endregion FUNC_harness

describe("store that does not open", () => {
	it("states the error and answers each read with no partial service", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		boundary.fail = () => new Error("EACCES: permission denied");
		const { host } = harness();
		expect(boundary.attempts).toBe(1);
		expect(host.storeState()).toEqual({
			ready: false,
			error: "EACCES: permission denied",
		});
		expect(() => host.store).toThrow(/not open/);
		const memory = host.forProfile("default");
		expect(memory.storeState.ready).toBe(false);
		expect(memory.config.defaultProfile).toBe("default");
		expect(() => memory.store).toThrow(/not open/);
		expect(host.profiles()).toContain("default");
	});
});

describe("retry of a store that does not open", () => {
	it("doubles the wait of a failure that another attempt can change", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		boundary.fail = () => new Error("EACCES: permission denied");
		const { host } = harness();
		expect(boundary.attempts).toBe(1);
		vi.advanceTimersByTime(999);
		expect(boundary.attempts).toBe(1);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(2);
		vi.advanceTimersByTime(1_999);
		expect(boundary.attempts).toBe(2);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(3);
		boundary.fail = null;
		vi.advanceTimersByTime(4_000);
		expect(boundary.attempts).toBe(4);
		expect(host.storeState()).toEqual({ ready: true, error: null });
	});

	it("waits five seconds at first for the lock of another writer", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		boundary.fail = () => new Error("database is locked");
		harness();
		expect(boundary.attempts).toBe(1);
		vi.advanceTimersByTime(4_999);
		expect(boundary.attempts).toBe(1);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(2);
		vi.advanceTimersByTime(9_999);
		expect(boundary.attempts).toBe(2);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(3);
		vi.advanceTimersByTime(19_999);
		expect(boundary.attempts).toBe(3);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(4);
		vi.advanceTimersByTime(39_999);
		expect(boundary.attempts).toBe(4);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(5);
		vi.advanceTimersByTime(59_999);
		expect(boundary.attempts).toBe(5);
		vi.advanceTimersByTime(1);
		expect(boundary.attempts).toBe(6);
	});

	it("notifies one store listener at the open and starts no second open", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		boundary.fail = () => new Error("EACCES: permission denied");
		const { host } = harness();
		const listener = vi.fn();
		host.onStoreChange(listener);
		expect(listener).not.toHaveBeenCalled();
		boundary.fail = null;
		host.retry();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(boundary.attempts).toBe(2);
		host.retry();
		expect(boundary.attempts).toBe(2);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("stops its timer at disposal", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		boundary.fail = () => new Error("EACCES: permission denied");
		const { root } = harness();
		expect(boundary.attempts).toBe(1);
		await root.fiber.dispose();
		vi.advanceTimersByTime(600_000);
		expect(boundary.attempts).toBe(1);
	});
});
