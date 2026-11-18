/**
 * The rules of the active scope.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve one active scope key for one working context, so each session writes the scope
 * of its directory and workspace.
 * @scope
 *  - Rule matching, the automatic fallback list, the repository name of a remote, the visible scope
 *    list of a profile, and the join of the active scope into the globs of a profile.
 *  - NOT: reading the git configuration, the file system, or the harness state. The caller collects
 *    the subject.
 * @invariants
 *  - Each match gives a valid scope key, or falls through to the next rule or the default.
 *  - The automatic list applies after the rules: the git remote, the repository name, the
 *    workspace name, the directory name, then the fallback key of the caller.
 *  - The remote key keeps the full path after the host, in lowercase.
 *  - The visible list holds only scope keys that a profile glob matches, in the given order.
 *  - The join adds the literal key of the active scope when no profile glob matches it.
 * @usecases
 *  - Active scope: caller => gives the rules and the subject => gets the key and the rule index
 *  - Automatic scope: caller => gives the subject => gets the key and the source name
 *  - Session scopes: caller => gives the profile globs and the active key => gets the joined globs
 * @keywords active, scope, rule, git_remote, path, workspace, repo, automatic, source, visible, join
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";
import { globMatches } from "./config.js";
import type { Glob, Rule, ScopeDefault } from "./config-types.js";
import {
	isCatalogKey,
	normalizeScopeKey,
	sanitizeName,
	validateScopeKey,
} from "./scope.js";

const debug = debuglog("memlens:active-scope");

/** The inputs of the rules and the automatic list from one working context. */
export interface ScopeSubject {
	/** The origin URL of the repository, in the ssh, scp, or https form. */
	gitRemote?: string | null;

	/** The repository name without a remote, for example `memlens` or `acme/api`. */
	repo?: string | null;

	/** The workspace id, for example `ws_01H`. The rules match it. */
	workspace?: string | null;

	/** The workspace name, for example `dsh`. The automatic list uses it. */
	workspaceName?: string | null;

	/** The working directory. The automatic list takes its last segment. */
	path?: string | null;
}

/** The active scope key with the rule that gave it. */
export interface ActiveScope {
	key: ScopeKey;

	/** The index of the rule in the list, or null when the default key applies. */
	rule: number | null;
}

/** The step of the automatic list that gave the key. */
export type AutomaticSource =
	| "git_remote"
	| "git"
	| "workspace"
	| "path"
	| "default";

/** The automatic active scope key with the step that gave it. */
export interface AutomaticScope {
	key: ScopeKey;
	source: AutomaticSource;
}

/** The fallback key when the caller states none. */
const FALLBACK_SCOPE_KEY = "project:misc" as ScopeKey;

// #region FUNC_repoName
/**
 * @purpose Take the repository name from one remote, so `{repo}` names the project.
 * @param remote - The remote URL, for example `git@github.com:knopki/optmem.git`.
 * @returns The last path segment of the remote, without `.git`, sanitized.
 */
export function repoName(remote: string): string {
	const last = remote.trim().split(/[/:]/).filter(Boolean).at(-1) ?? "";
	return sanitizeName(last.replace(/\.git$/, ""));
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

// #region FUNC_automaticScope
/**
 * @purpose Apply the automatic list to one subject, so a context with no matching rule gets a key.
 * @invariants The list runs in order: git remote, repository name, workspace name, directory name,
 *   then the fallback key.
 * @invariants An ssh, scp, or https remote gives `project:<path after the host>`, and the path
 *   keeps each nested group. A local remote gives no key.
 * @invariants Each derived name composes NFC, and each forbidden sign becomes one underscore. An
 *   empty name skips its step.
 * @ensures The result names its source, and the last step gives the fallback key.
 * @param subject - The collected inputs of the context.
 * @param fallback - The key of the last step, from the `default` key of the configuration.
 * @returns The key and the source of the first step that gives a valid key.
 */
export function automaticScope(
	subject: ScopeSubject,
	fallback: ScopeKey = FALLBACK_SCOPE_KEY,
): AutomaticScope {
	const remote = subject.gitRemote;
	if (remote !== null && remote !== undefined) {
		const key = remoteScope(remote);
		if (key !== null) return selected(key, "git_remote");
	}
	const repo = namedScope(subject.repo);
	if (repo !== null) return selected(repo, "git");
	const workspace = namedScope(subject.workspaceName);
	if (workspace !== null) return selected(workspace, "workspace");
	const directory = namedScope(dirName(subject.path));
	if (directory !== null) return selected(directory, "path");
	return selected(fallback, "default");
}
// #endregion FUNC_automaticScope

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

function selected(key: ScopeKey, source: AutomaticSource): AutomaticScope {
	debug("Automatic scope selected", {
		event: "automatic-scope",
		key,
		source,
	});
	return { key, source };
}

// #region FUNC_remoteScope
/**
 * @purpose Take the scope key from one remote, so the automatic list names the project of the remote.
 * @invariants The forms `ssh://`, `scp`, and `https://` are accepted.
 * @invariants The key holds the path after the host, so a nested group stays complete.
 * @invariants A local remote gives no key, and a path with no organization gives no key.
 * @param remote - The origin URL of the repository.
 * @returns The `project:` key in lowercase, or null when the remote gives no organization.
 */
function remoteScope(remote: string): ScopeKey | null {
	const text = remote.trim();
	if (text.length === 0) return null;

	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
	if (scheme !== null) {
		if (scheme[1]?.toLowerCase() === "file") return null;
		const afterScheme = text.slice(scheme[0].length);
		const slash = afterScheme.indexOf("/");
		if (slash < 1) return null;
		return remotePathScope(afterScheme.slice(slash + 1));
	}

	if (isLocalRemote(text)) return null;

	const port = /^([^/:]+):(\d+)\/(.+)$/.exec(text);
	if (port !== null) return remotePathScope(port[3] ?? "");

	const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(text);
	if (scp !== null) return remotePathScope(scp[2] ?? "");

	const slash = text.indexOf("/");
	if (slash < 1) return null;
	const host = text.slice(0, slash);
	if (!host.includes(".") && host !== "localhost") return null;
	return remotePathScope(text.slice(slash + 1));
}
// #endregion FUNC_remoteScope

function isLocalRemote(remote: string): boolean {
	if (/^file:/i.test(remote)) return true;
	if (
		remote.startsWith("/") ||
		remote.startsWith("./") ||
		remote.startsWith("../") ||
		remote.startsWith("~/")
	) {
		return true;
	}
	return /^[a-z]:[\\/]/i.test(remote);
}

function remotePathScope(path: string): ScopeKey | null {
	const clean = (path.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
	const segments = clean.split("/").filter((part) => part.length > 0);
	if (segments.length < 2) return null;
	const last = segments.at(-1)?.replace(/\.git$/i, "") ?? "";
	if (last.length === 0) return null;
	const name = sanitizeName([...segments.slice(0, -1), last].join("/"));
	const key = normalizeScopeKey(`project:${name}`);
	return validateScopeKey(key) ? key : null;
}

function namedScope(value: string | null | undefined): ScopeKey | null {
	if (value === null || value === undefined) return null;
	const name = value.trim();
	if (name.length === 0) return null;
	const key = normalizeScopeKey(`project:${sanitizeName(name)}`);
	return validateScopeKey(key) ? key : null;
}

function dirName(path: string | null | undefined): string | null {
	if (path === null || path === undefined) return null;
	const trimmed = path.trim().replace(/[\\/]+$/, "");
	const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return trimmed.slice(index + 1);
}

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
