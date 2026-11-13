/**
 * The rules of the active scope.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve one active scope key for one working context, so each session writes the scope
 * that its directory and workspace name.
 * @scope
 *  - Rule matching, the repository name of a remote, and the visible scope list of a profile.
 *  - NOT: reading the git configuration, the file system, or the harness state. The caller collects
 *    the subject.
 * @invariants
 *  - The rules go in order, and the first matching rule gives the active scope.
 *  - A rule matches `git_remote` with a glob, `path` with a glob, or `workspace` with an id.
 *  - A rule with no input in the subject gives no match.
 *  - The key part `{repo}` takes the repository name of the remote, in lowercase.
 *  - A substituted key outside the scope grammar gives no match, and the next rule applies.
 *  - No matching rule gives the key of `default`.
 *  - Several rules can give one key.
 *  - The visible scope list holds the scopes that at least one glob of the profile matches, in the
 *    order of the given scopes, and no hidden catalog key.
 *  - The glob `*` matches any text, so the key `*` alone matches each scope.
 * @usecases
 *  - Active scope: caller => gives the rules and the subject => gets the key and the rule index
 * @dependencies USES API: config.ts globMatches, scope.ts
 * @keywords active, scope, rule, git_remote, path, workspace, repo, visible
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/events.js";
import type { Glob, Rule, ScopeDefault } from "./config.js";
import { globMatches } from "./config.js";
import { isCatalogKey, validateScopeKey } from "./scope.js";

const debug = debuglog("memlens:active-scope");

/** The inputs of the rules from one working context. A missing input skips its rules. */
export interface ScopeSubject {
	gitRemote?: string | null;
	path?: string | null;
	workspace?: string | null;
}

/** The active scope key with the rule that gave it. */
export interface ActiveScope {
	key: ScopeKey;
	/** The index of the rule in the list, or null when the default key applies. */
	rule: number | null;
}

// #region FUNC_repoName

/**
 * @purpose Take the repository name from one remote, so `{repo}` names the project.
 * @param remote - The remote URL, for example `git@github.com:knopki/optmem.git`.
 * @returns The last path segment of the remote, without `.git`, in lowercase.
 */
export function repoName(remote: string): string {
	const last = remote.trim().split(/[/:]/).filter(Boolean).at(-1) ?? "";
	return last.replace(/\.git$/, "").toLowerCase();
}

// #endregion FUNC_repoName

// #region FUNC_activeScope

/**
 * @purpose Apply the ordered rules to one subject, so one context maps to one scope key.
 * @param scopeDefault - The rules and the default key from the configuration.
 * @param subject - The collected inputs of the context.
 * @returns The key and the index of the first matching rule, or the default key.
 */
export function activeScope(
	scopeDefault: ScopeDefault,
	subject: ScopeSubject,
): ActiveScope {
	for (const [index, rule] of scopeDefault.rules.entries()) {
		const key = ruleKey(rule, subject);
		if (key === null) continue;
		debug("Active scope matched", {
			event: "active-scope",
			key,
			rule: index,
			match: rule.match,
		});
		return { key, rule: index };
	}
	debug("Active scope default", {
		event: "active-scope",
		key: scopeDefault.default,
		rule: null,
	});
	return { key: scopeDefault.default, rule: null };
}

// #endregion FUNC_activeScope

// #region FUNC_visibleScopes

/**
 * @purpose Filter the known scopes through the globs of one profile, so the profile sees its scopes only.
 * @param globs - The scope globs of the profile.
 * @param scopes - Each known scope key, in store order.
 * @returns The matched scope keys, with no hidden catalog key.
 */
export function visibleScopes(
	globs: readonly Glob[],
	scopes: readonly ScopeKey[],
): ScopeKey[] {
	const visible = scopes.filter(
		(key) => !isCatalogKey(key) && globs.some((glob) => globMatches(glob, key)),
	);
	debug("Visible scopes resolved", {
		event: "visible-scopes",
		known: scopes.length,
		visible: visible.length,
	});
	return visible;
}

// #endregion FUNC_visibleScopes

function ruleKey(rule: Rule, subject: ScopeSubject): ScopeKey | null {
	if (rule.match === "git_remote") {
		if (subject.gitRemote === null || subject.gitRemote === undefined)
			return null;
		if (!globMatches(rule.glob, subject.gitRemote)) return null;
		const key = rule.key.replaceAll(
			"{repo}",
			repoName(subject.gitRemote),
		) as ScopeKey;
		return validateScopeKey(key) ? key : null;
	}
	if (rule.match === "path") {
		if (subject.path === null || subject.path === undefined) return null;
		if (!globMatches(rule.glob, subject.path)) return null;
		return rule.key;
	}
	if (
		subject.workspace === null ||
		subject.workspace === undefined ||
		subject.workspace !== rule.id
	) {
		return null;
	}
	return rule.key;
}
