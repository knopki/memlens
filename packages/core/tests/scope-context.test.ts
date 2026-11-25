/**
 * #region moduleContract
 * @purpose Check the shared scope result against real Git repositories and configuration.
 * @scope Remote selection, effective URLs, inherited Git context, rules, and automatic results.
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScopeDefault } from "../src/domain/config-types.js";
import { resolveScopeContext } from "../src/scope-context.js";

const defaults: ScopeDefault = { rules: [], default: "user:notes" };

let root: string;

beforeEach(() => {
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("GIT_")) vi.stubEnv(name, undefined);
	}
	root = mkdtempSync(join(tmpdir(), "memlens-scope-context-"));
	vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
	vi.stubEnv("GIT_CONFIG_GLOBAL", join(root, "absent-config"));
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

function repository(name: string): string {
	const path = join(root, name);
	mkdirSync(path);
	git(path, "init", "-q");
	return path;
}

describe("resolveScopeContext", () => {
	it("prefers origin and retains the inputs for diagnostics", () => {
		const repo = repository("Local-Repo");
		git(repo, "remote", "add", "alpha", "git@github.com:Other/Repo.git");
		git(repo, "remote", "add", "origin", "git@github.com:Acme/Demo.git");
		const nested = join(repo, "nested");
		mkdirSync(nested);
		expect(resolveScopeContext(defaults, nested)).toEqual({
			key: "project:Acme/Demo",
			rule: null,
			source: "git_remote",
			remote: "git@github.com:Acme/Demo.git",
			canonical: "github.com/Acme/Demo",
			dir: nested,
			repo: "Local-Repo",
			trace: [],
		});
	});

	it("uses the first remote from Git when origin is absent", () => {
		const repo = repository("local");
		git(repo, "remote", "add", "zeta", "https://example.com/Team/Zeta.git");
		git(repo, "remote", "add", "alpha", "https://example.com/Team/Alpha.git");
		expect(resolveScopeContext(defaults, repo).key).toBe("project:Team/Alpha");
	});

	it("uses the effective URL after an insteadOf rewrite", () => {
		const repo = repository("local");
		git(repo, "remote", "add", "origin", "https://example.com/Old/Demo.git");
		git(
			repo,
			"config",
			"url.https://mirror.example/New/.insteadOf",
			"https://example.com/Old/",
		);
		expect(resolveScopeContext(defaults, repo)).toMatchObject({
			key: "project:New/Demo",
			remote: "https://mirror.example/New/Demo.git",
			canonical: "mirror.example/New/Demo",
		});
	});

	it("matches the canonical remote and keeps the full rule trace", () => {
		const repo = repository("local");
		git(repo, "remote", "add", "origin", "git@github.com:Acme/Demo.git");
		const result = resolveScopeContext(
			{
				...defaults,
				rules: [
					{ match: "workspace", id: "other", key: "project:other" },
					{
						match: "git_remote",
						glob: "github.com/Acme/*",
						key: "project:{repo}",
					},
				],
			},
			repo,
			"current",
			"Workspace",
		);
		expect(result).toMatchObject({
			key: "project:Demo",
			rule: 1,
			source: "rule",
		});
		expect(result.trace.map((entry) => entry.verdict)).toEqual([
			"no-match",
			"matched",
		]);
	});

	it("uses the inherited Git context even when it names another repository", () => {
		const cwd = repository("wanted");
		const foreign = repository("foreign");
		git(
			foreign,
			"remote",
			"add",
			"origin",
			"https://example.com/Other/Repo.git",
		);
		vi.stubEnv("GIT_DIR", join(foreign, ".git"));
		expect(resolveScopeContext(defaults, cwd)).toMatchObject({
			key: "project:Other/Repo",
			remote: "https://example.com/Other/Repo.git",
			repo: "foreign",
			dir: cwd,
		});
	});

	it("uses the repository name before the workspace title when no remote exists", () => {
		const repo = repository("Local-Repo");
		expect(
			resolveScopeContext(defaults, repo, "ws", "Workspace"),
		).toMatchObject({
			key: "project:Local-Repo",
			source: "git",
			remote: null,
		});
	});

	it("uses the repository name for a local remote", () => {
		const repo = repository("Local-Repo");
		git(repo, "remote", "add", "origin", "/srv/git/Other.git");
		expect(resolveScopeContext(defaults, repo)).toMatchObject({
			key: "project:Local-Repo",
			source: "git",
		});
	});

	it("uses workspace rules and titles without a working directory", () => {
		expect(resolveScopeContext(defaults, "", "ws", "Workspace")).toMatchObject({
			key: "project:Workspace",
			source: "workspace",
			remote: null,
			repo: null,
		});
		expect(
			resolveScopeContext(
				{
					...defaults,
					rules: [{ match: "workspace", id: "ws", key: "project:chosen" }],
				},
				"",
				"ws",
				"Workspace",
			),
		).toMatchObject({ key: "project:chosen", rule: 0, source: "rule" });
		expect(resolveScopeContext(defaults, "").key).toBe("user:notes");
	});

	it("falls back to the directory when Git cannot run there", () => {
		expect(resolveScopeContext(defaults, join(root, "absent"))).toMatchObject({
			key: "project:absent",
			source: "path",
			remote: null,
			repo: null,
		});
	});
});
