/**
 * #region moduleContract
 * @purpose Give the CLI and the plugin one scope result from Git and the working context.
 * @scope Git inputs, scope rules, the automatic list, and the rule trace.
 * @invariants Git uses the current environment and configuration without changes.
 * @invariants The remote is the effective URL of origin, or the first remote when origin is absent.
 * @invariants A Git failure gives no input, so the rules and the automatic list still apply.
 * @dependencies USES API: node:child_process, node:path, domain/active-scope
 * @keywords scope, context, git, remote, workspace, trace
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { debuglog } from "node:util";
import {
	automaticScope,
	normalizeRemote,
	type RuleTrace,
	resolveScope,
} from "./domain/active-scope.js";
import type { ScopeDefault } from "./domain/config-types.js";
import type { ScopeKey } from "./types/primitives.js";

const debug = debuglog("memlens:scope-context");

/** The selected scope, its Git inputs, and the verdict of each rule. */
export interface ScopeContextResult {
	readonly key: ScopeKey;

	/** The index of the first matching rule, or null for an automatic result. */
	readonly rule: number | null;

	/** The word `rule`, or the name of the automatic step. */
	readonly source: string;

	/** The effective Git remote URL, or null. */
	readonly remote: string | null;

	/** The canonical remote URL, or null. */
	readonly canonical: string | null;

	/** The working directory of the caller. */
	readonly dir: string;

	/** The repository name, or null outside a repository. */
	readonly repo: string | null;
	readonly trace: readonly RuleTrace[];
}

// #region FUNC_resolveScopeContext
/**
 * @purpose Resolve one scope for both hosts, with the inputs and trace for CLI diagnostics.
 * @invariants A matching rule takes precedence over the automatic list.
 * @invariants Rules read the canonical remote, and the automatic list reads the effective Git URL.
 * @invariants A Git worktree uses the main repository name.
 * @invariants An empty directory gives no Git input.
 */
export function resolveScopeContext(
	scopeDefault: ScopeDefault,
	cwd: string,
	workspace?: string,
	workspaceName?: string,
): ScopeContextResult {
	const git = (...args: string[]): string | null => {
		if (!cwd) return null;
		try {
			return (
				execFileSync("git", args, {
					cwd,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim() || null
			);
		} catch {
			return null;
		}
	};
	const remote = selectedRemote(git);
	const canonical = remote === null ? null : normalizeRemote(remote);
	const subject = {
		gitRemote: canonical,
		path: cwd || null,
		workspace: workspace ?? null,
		workspaceName: workspaceName ?? null,
		repo: repositoryName(git),
	};
	const resolution = resolveScope(scopeDefault, subject);
	const selected =
		resolution.rule === null
			? automaticScope({ ...subject, gitRemote: remote }, scopeDefault.default)
			: { key: resolution.key, source: "rule" };
	debug("Scope selected", {
		event: "scope",
		key: selected.key,
		source: selected.source,
		rule: resolution.rule,
	});
	return {
		...selected,
		rule: resolution.rule,
		remote,
		canonical,
		dir: cwd,
		repo: subject.repo,
		trace: resolution.trace,
	};
}
// #endregion FUNC_resolveScopeContext

// #region FUNC_selectedRemote
/**
 * @purpose Select the same effective remote URL for both hosts.
 * @invariants Origin wins when present. Otherwise, the first remote applies.
 * @invariants A missing repository or remote gives null.
 */
function selectedRemote(
	git: (...args: string[]) => string | null,
): string | null {
	const names =
		git("remote")
			?.split("\n")
			.map((name) => name.trim())
			.filter((name) => name.length > 0) ?? [];
	const name = names.includes("origin") ? "origin" : names[0];
	return name === undefined ? null : git("remote", "get-url", name);
}
// #endregion FUNC_selectedRemote

// #region FUNC_repositoryName
/**
 * @purpose Keep the main repository name across Git worktrees.
 * @invariants The name keeps its case. A directory outside a repository gives null.
 */
function repositoryName(
	git: (...args: string[]) => string | null,
): string | null {
	const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
	const root = common === null ? null : git("rev-parse", "--show-toplevel");
	if (common === null || root === null) return null;
	return basename(common) === ".git"
		? basename(dirname(common))
		: basename(root);
}
// #endregion FUNC_repositoryName
