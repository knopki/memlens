/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove target reads and named errors with a real store and a caller scope policy.
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeScopeKey } from "../src/domain/scope.js";
import { resolveTarget } from "../src/domain/target.js";
import { note } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import type { Note } from "../src/store/types.js";
import { MemlensError } from "../src/types/errors.js";
import type { ScopeKey } from "../src/types/primitives.js";

const scope = "project:target" as ScopeKey;

let dir: string;

let store: Store;

let row: Note;

function canSee(raw: string): ScopeKey {
	const key = normalizeScopeKey(raw) as ScopeKey;
	if (key !== scope)
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return key;
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "memlens-target-"));
	store = new Store(dir);
	const saved = note(store, {
		scope,
		body: "Target note",
		kind: "fact",
		session: "test",
		turn: "test",
		preset: "test",
	});
	if (!saved.ok) throw new Error(saved.reason);
	row = saved.value;
});

afterEach(() => {
	store.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("resolveTarget", () => {
	it("reads numeric, bare, and scoped targets through the caller policy", () => {
		for (const target of [row.pos, `#${row.pos}`, `${scope}#${row.pos}`])
			expect(resolveTarget(store, scope, target, canSee)).toEqual(row);
		expect(resolveTarget(store, null, `${scope}#${row.pos}`, canSee)).toEqual(
			row,
		);
	});

	it("refuses range addresses with Usage", () => {
		for (const target of ["0-1", `${scope}#0-1`])
			expect(() => resolveTarget(store, scope, target, canSee)).toThrow(
				expect.objectContaining({ code: "Usage" }),
			);
	});

	it("refuses an absent note with Data", () => {
		for (const target of [999, -1, 0.5])
			expect(() => resolveTarget(store, scope, target, canSee)).toThrow(
				expect.objectContaining({ code: "Data" }),
			);
	});

	it("checks explicit and fallback scopes before the note read", () => {
		for (const [fallback, target] of [
			[scope, "project:outside#999"],
			["project:outside", row.pos],
		] as const)
			expect(() => resolveTarget(store, fallback, target, canSee)).toThrow(
				expect.objectContaining({ code: "NotAllowed" }),
			);
	});

	it("refuses malformed targets and an absent fallback with Usage", () => {
		for (const target of ["abc", row.pos])
			expect(() => resolveTarget(store, null, target, canSee)).toThrow(
				expect.objectContaining({ code: "Usage" }),
			);
	});

	it("lets the caller resolve a proposal target outside its profile", () => {
		const saved = note(store, {
			scope: "project:outside" as ScopeKey,
			body: "Proposal target",
			kind: "fact",
			session: "test",
			turn: "test",
			preset: "test",
		});
		if (!saved.ok) throw new Error(saved.reason);
		expect(
			resolveTarget(
				store,
				scope,
				`project:outside#${saved.value.pos}`,
				(raw) => normalizeScopeKey(raw) as ScopeKey,
			),
		).toEqual(saved.value);
	});
});
