/**
 * The rules of the active scope.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve one active scope key for one working context, so each session writes the scope
 * that its directory and workspace name.
 * @scope
 *  - Rule matching, the repository name of a remote, the visible scope list of a profile, and the
 *    join of the active scope into the globs of a profile.
 *  - NOT: reading the git configuration, the file system, or the harness state. The caller collects
 *    the subject.
 * @invariants
 *  - Each match gives a valid scope key, or falls through to the next rule or the default.
 *  - The visible list holds only scope keys that a profile glob matches, in the given order.
 *  - The join adds the literal key of the active scope when no profile glob matches it.
 * @usecases
 *  - Active scope: caller => gives the rules and the subject => gets the key and the rule index
 *  - Session scopes: caller => gives the profile globs and the active key => gets the joined globs
 * @dependencies USES API: config.ts globMatches, config-types.ts, scope.ts
 * @keywords active, scope, rule, git_remote, path, workspace, repo, visible, join
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";
import { globMatches } from "./config.js";
import type { Glob, Rule, ScopeDefault } from "./config-types.js";
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
 * @invariants A rule matches `git_remote` with a glob, `path` with a glob, or `workspace` with an id.
 * @invariants The rules go in order, and the first match gives the key and its rule index.
 * @invariants A rule with no subject input gives no match, and the key part `{repo}` takes the
 * remote repository name in lowercase.
 * @invariants A substituted key outside the scope grammar gives no match, and the next rule applies.
 * @ensures No matching rule gives the key of `default` and a null rule index.
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

// #region FUNC_withActiveScope
/**
 * @purpose Add the active scope key to the globs of one profile, so a session works in its own scope.
 * @invariants The result holds the given globs, and a new last entry with the literal key.
 * @invariants A glob that matches the key gives the given globs with no new entry.
 * @param globs - The scope globs of the profile.
 * @param active - The active scope key of the session.
 * @returns The joined globs of the session.
 */
export function withActiveScope(
	globs: readonly Glob[],
	active: ScopeKey,
): Glob[] {
	if (globs.some((glob) => globMatches(glob, active))) return [...globs];
	debug("Active scope joined the profile", {
		event: "active-scope-join",
		scope: active,
	});
	return [...globs, active];
}
// #endregion FUNC_withActiveScope

// #region FUNC_visibleScopes
/**
 * @purpose Filter the known scopes through the globs of one profile, so the profile sees its scopes only.
 * @invariants The result keeps the given order and holds each scope that at least one glob matches.
 * @invariants A hidden catalog key never enters the result. The glob `*` matches any text.
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
