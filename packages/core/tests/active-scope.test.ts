/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the ordered rules of the active scope and the visible scope list.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	activeScope,
	repoName,
	type ScopeSubject,
	visibleScopes,
	withActiveScope,
} from "../src/domain/active-scope.js";
import type { Rule, ScopeDefault } from "../src/domain/config-types.js";

const RULES: Rule[] = [
	{ match: "git_remote", glob: "github.com/knopki/*", key: "project:{repo}" },
	{ match: "path", glob: "/home/*/acme/*", key: "project:acme/x" },
	{ match: "workspace", id: "ws_01H", key: "project:dsh/optmem" },
];

const SCOPE_DEFAULT: ScopeDefault = { rules: RULES, default: "project:misc" };

describe("repoName", () => {
	it("takes the last segment of an https remote", () => {
		expect(repoName("github.com/knopki/optmem")).toBe("optmem");
	});

	it("strips the git suffix of an ssh remote and lowercases", () => {
		expect(repoName("git@github.com:knopki/OptMem.git")).toBe("optmem");
	});
});

describe("activeScope", () => {
	it("gives the key of the first matching rule", () => {
		const subject: ScopeSubject = {
			gitRemote: "github.com/knopki/optmem",
			path: "/home/u/acme/x",
		};
		const result = activeScope(SCOPE_DEFAULT, subject);
		expect(result).toEqual({ key: "project:optmem", rule: 0 });
	});

	it("substitutes the repository name into the key", () => {
		const result = activeScope(SCOPE_DEFAULT, {
			gitRemote: "github.com/knopki/dsh",
		});
		expect(result.key).toBe("project:dsh");
	});

	it("matches a path with a glob", () => {
		const result = activeScope(SCOPE_DEFAULT, { path: "/home/u/acme/api" });
		expect(result).toEqual({ key: "project:acme/x", rule: 1 });
	});

	it("matches a workspace by id", () => {
		const result = activeScope(SCOPE_DEFAULT, { workspace: "ws_01H" });
		expect(result).toEqual({ key: "project:dsh/optmem", rule: 2 });
	});

	it("gives the default key when no rule matches", () => {
		expect(activeScope(SCOPE_DEFAULT, { path: "/elsewhere" })).toEqual({
			key: "project:misc",
			rule: null,
		});
	});

	it("skips a rule with no input in the subject", () => {
		const result = activeScope(SCOPE_DEFAULT, {
			path: "/home/u/acme/x",
			workspace: "ws_01H",
		});
		expect(result).toEqual({ key: "project:acme/x", rule: 1 });
	});

	it("skips a rule whose substituted key is invalid", () => {
		const rules: Rule[] = [
			{ match: "git_remote", glob: "*", key: "project:{repo}" },
			{ match: "path", glob: "*", key: "project:fallback" },
		];
		const result = activeScope(
			{ rules, default: "project:misc" },
			{ gitRemote: "", path: "/x" },
		);
		expect(result).toEqual({ key: "project:fallback", rule: 1 });
	});

	it("lets several rules give one key", () => {
		const rules: Rule[] = [
			{ match: "path", glob: "/a/*", key: "project:same" },
			{ match: "path", glob: "/b/*", key: "project:same" },
		];
		const scopeDefault = { rules, default: "project:misc" };
		expect(activeScope(scopeDefault, { path: "/a/x" }).key).toBe(
			"project:same",
		);
		expect(activeScope(scopeDefault, { path: "/b/x" }).key).toBe(
			"project:same",
		);
	});
});

describe("visibleScopes", () => {
	const KNOWN = [
		"global:prefs",
		"project:dsh/optmem",
		"project:acme/x",
		"__catalog__:default",
	] as const;

	it("keeps the scopes that a glob matches, in order", () => {
		expect(visibleScopes(["project:dsh/*", "*:prefs"], KNOWN)).toEqual([
			"global:prefs",
			"project:dsh/optmem",
		]);
	});

	it("matches each scope with the star alone", () => {
		expect(visibleScopes(["*"], KNOWN)).toEqual([
			"global:prefs",
			"project:dsh/optmem",
			"project:acme/x",
		]);
	});

	it("keeps a shared scope in each profile that lists it", () => {
		expect(visibleScopes(["project:acme/*"], KNOWN)).toEqual([
			"project:acme/x",
		]);
	});
});

describe("withActiveScope", () => {
	it("appends the literal key when no glob matches", () => {
		expect(withActiveScope(["user:notes"], "project:memlens")).toEqual([
			"user:notes",
			"project:memlens",
		]);
	});

	it("adds no entry when a glob matches the key", () => {
		expect(withActiveScope(["project:*"], "project:memlens")).toEqual([
			"project:*",
		]);
	});

	it("adds no entry when the literal key is present", () => {
		expect(withActiveScope(["project:memlens"], "project:memlens")).toEqual([
			"project:memlens",
		]);
	});

	it("keeps the given order and adds the key last", () => {
		expect(
			withActiveScope(["*:prefs", "project:other/*"], "project:memlens"),
		).toEqual(["*:prefs", "project:other/*", "project:memlens"]);
	});
});
