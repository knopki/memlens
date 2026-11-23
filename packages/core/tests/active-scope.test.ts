/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the ordered rules of the active scope and the visible scope list.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	activeScope,
	automaticScope,
	normalizeRemote,
	repoName,
	resolveScope,
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

	it("strips the git suffix of an ssh remote and keeps the case", () => {
		expect(repoName("git@github.com:knopki/OptMem.git")).toBe("OptMem");
	});
});

describe("normalizeRemote", () => {
	it("takes the host and the path from an scp remote", () => {
		expect(normalizeRemote("git@github.com:knopki/yascheduler.git")).toBe(
			"github.com/knopki/yascheduler",
		);
	});

	it("takes the host and the path from an https remote", () => {
		expect(normalizeRemote("https://github.com/knopki/yascheduler.git")).toBe(
			"github.com/knopki/yascheduler",
		);
	});

	it("removes the user part of an ssh url", () => {
		expect(normalizeRemote("ssh://git@github.com/knopki/yascheduler")).toBe(
			"github.com/knopki/yascheduler",
		);
	});

	it("removes a trailing slash", () => {
		expect(normalizeRemote("https://github.com/knopki/yascheduler/")).toBe(
			"github.com/knopki/yascheduler",
		);
	});

	it("keeps a local remote as its path", () => {
		expect(normalizeRemote("/srv/git/Local-Repo.git")).toBe(
			"/srv/git/Local-Repo",
		);
	});
});

describe("resolveScope", () => {
	it("gives the verdict of each rule", () => {
		const resolution = resolveScope(SCOPE_DEFAULT, {
			gitRemote: "github.com/other/repo",
			path: "/home/u/acme/x",
		});
		expect(resolution.trace.map((entry) => entry.verdict)).toEqual([
			"no-match",
			"matched",
			"no-input",
		]);
		expect(resolution).toMatchObject({ key: "project:acme/x", rule: 1 });
	});

	it("matches a rule of the canonical remote", () => {
		const rules: Rule[] = [
			{
				match: "git_remote",
				glob: "github.com/knopki/yascheduler",
				key: "project:absolidix/{repo}",
			},
		];
		const resolution = resolveScope(
			{ rules, default: "project:misc" },
			{
				gitRemote: normalizeRemote("git@github.com:knopki/yascheduler.git"),
			},
		);
		expect(resolution.key).toBe("project:absolidix/yascheduler");
		expect(resolution.trace[0]?.verdict).toBe("matched");
	});

	it("tells an invalid key from a glob miss", () => {
		const rules: Rule[] = [
			{ match: "git_remote", glob: "*", key: "project:{repo}" },
		];
		const resolution = resolveScope(
			{ rules, default: "project:misc" },
			{ gitRemote: "" },
		);
		expect(resolution.trace[0]).toMatchObject({
			verdict: "invalid-key",
			key: null,
		});
		expect(resolution).toMatchObject({ key: "project:misc", rule: null });
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

	it("keeps the workspace id for the rules", () => {
		const result = activeScope(SCOPE_DEFAULT, {
			workspace: "ws_01H",
			workspaceName: "dsh",
		});
		expect(result).toEqual({ key: "project:dsh/optmem", rule: 2 });
	});

	it("keeps the configured default with no matching rule", () => {
		expect(activeScope({ rules: [], default: "project:other" }, {})).toEqual({
			key: "project:other",
			rule: null,
		});
	});
});

describe("automaticScope", () => {
	it("takes the organization and the repository from a normalized remote", () => {
		expect(automaticScope({ gitRemote: "github.com/knopki/memlens" })).toEqual({
			key: "project:knopki/memlens",
			source: "git_remote",
		});
	});

	it("takes the organization and the repository from an scp remote", () => {
		expect(
			automaticScope({ gitRemote: "git@github.com:knopki/OptMem.git" }),
		).toEqual({
			key: "project:knopki/OptMem",
			source: "git_remote",
		});
	});

	it("takes the organization and the repository from an https remote", () => {
		expect(
			automaticScope({
				gitRemote: "https://github.com/knopki/memlens.git",
			}),
		).toEqual({
			key: "project:knopki/memlens",
			source: "git_remote",
		});
	});

	it("takes the organization and the repository from an ssh url", () => {
		expect(
			automaticScope({
				gitRemote: "ssh://git@github.com:2222/knopki/memlens.git",
			}),
		).toEqual({
			key: "project:knopki/memlens",
			source: "git_remote",
		});
	});

	it("drops a port from a normalized remote", () => {
		expect(
			automaticScope({ gitRemote: "github.com:2222/knopki/memlens.git" }),
		).toEqual({
			key: "project:knopki/memlens",
			source: "git_remote",
		});
	});

	it("keeps each nested group after the host", () => {
		expect(
			automaticScope({
				gitRemote: "git@gitlab.com:acme/team/MemLens.git",
			}),
		).toEqual({
			key: "project:acme/team/MemLens",
			source: "git_remote",
		});
	});

	it("skips an absolute local remote", () => {
		expect(
			automaticScope({
				gitRemote: "/srv/git/memlens.git",
				repo: "memlens",
			}),
		).toEqual({ key: "project:memlens", source: "git" });
	});

	it("skips a relative local remote", () => {
		expect(
			automaticScope({
				gitRemote: "../repos/memlens",
				repo: "memlens",
			}),
		).toEqual({ key: "project:memlens", source: "git" });
	});

	it("skips a relative local remote with no host", () => {
		expect(
			automaticScope({ gitRemote: "acme/memlens", repo: "memlens" }),
		).toEqual({ key: "project:memlens", source: "git" });
	});

	it("skips a file remote", () => {
		expect(
			automaticScope({
				gitRemote: "file:///srv/git/acme/memlens.git",
				repo: "memlens",
			}),
		).toEqual({ key: "project:memlens", source: "git" });
	});

	it("skips a remote with no organization", () => {
		expect(
			automaticScope({
				gitRemote: "git@github.com:memlens.git",
				repo: "memlens",
			}),
		).toEqual({ key: "project:memlens", source: "git" });
	});

	it("takes the repository name with no remote", () => {
		expect(automaticScope({ repo: "MemLens" })).toEqual({
			key: "project:MemLens",
			source: "git",
		});
	});

	it("keeps a nested repository name", () => {
		expect(automaticScope({ repo: "Acme/Team/MemLens" })).toEqual({
			key: "project:Acme/Team/MemLens",
			source: "git",
		});
	});

	it("takes the workspace name", () => {
		expect(automaticScope({ workspaceName: "Dsh" })).toEqual({
			key: "project:Dsh",
			source: "workspace",
		});
	});

	it("takes a workspace name with a leading period", () => {
		expect(automaticScope({ workspaceName: ".My-Workspace" })).toEqual({
			key: "project:.My-Workspace",
			source: "workspace",
		});
	});

	it("sanitizes the signs of a workspace name", () => {
		expect(automaticScope({ workspaceName: "Мой Воркспейс" })).toEqual({
			key: "project:Мой_Воркспейс",
			source: "workspace",
		});
	});

	it("takes the directory name", () => {
		expect(automaticScope({ path: "/home/knopki/prj/memlens/" })).toEqual({
			key: "project:memlens",
			source: "path",
		});
	});

	it("takes a directory name with a leading period", () => {
		expect(automaticScope({ path: "/home/knopki/.config" })).toEqual({
			key: "project:.config",
			source: "path",
		});
	});

	it("keeps the script of a directory name", () => {
		expect(automaticScope({ path: "/home/котя" })).toEqual({
			key: "project:котя",
			source: "path",
		});
		expect(automaticScope({ path: "/home/飞书" })).toEqual({
			key: "project:飞书",
			source: "path",
		});
	});

	it("replaces each forbidden sign of a directory name", () => {
		expect(automaticScope({ path: "/home/my notes" })).toEqual({
			key: "project:my_notes",
			source: "path",
		});
	});

	it("takes the file system root as the default", () => {
		expect(automaticScope({ path: "/" })).toEqual({
			key: "project:misc",
			source: "default",
		});
	});

	it("gives the default with no input", () => {
		expect(automaticScope({})).toEqual({
			key: "project:misc",
			source: "default",
		});
	});

	it("takes the stated fallback at the last step", () => {
		expect(automaticScope({}, "user:notes")).toEqual({
			key: "user:notes",
			source: "default",
		});
	});

	it("keeps each detection step before the stated fallback", () => {
		expect(automaticScope({ repo: "memlens" }, "user:notes")).toEqual({
			key: "project:memlens",
			source: "git",
		});
	});

	it("takes the remote before the other inputs", () => {
		expect(
			automaticScope({
				gitRemote: "github.com/acme/api",
				repo: "memlens",
				workspaceName: "dsh",
				path: "/home/knopki/prj/other",
			}),
		).toEqual({
			key: "project:acme/api",
			source: "git_remote",
		});
	});

	it("takes the repository before the workspace and the path", () => {
		expect(
			automaticScope({
				repo: "api",
				workspaceName: "dsh",
				path: "/home/knopki/prj/other",
			}),
		).toEqual({ key: "project:api", source: "git" });
	});

	it("takes the workspace before the path", () => {
		expect(
			automaticScope({
				workspaceName: "dsh",
				path: "/home/knopki/prj/other",
			}),
		).toEqual({ key: "project:dsh", source: "workspace" });
	});

	it("skips a blank name and takes the next step", () => {
		expect(
			automaticScope({
				workspaceName: "  ",
				path: "/home/knopki/prj/memlens",
			}),
		).toEqual({ key: "project:memlens", source: "path" });
	});

	it("keeps the result shape to the key and the source", () => {
		expect(Object.keys(automaticScope({ repo: "memlens" })).sort()).toEqual([
			"key",
			"source",
		]);
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
