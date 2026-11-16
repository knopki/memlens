/**
 * #region moduleContract
 * @modulecontract
 * @purpose Read each configuration layer into a complete shape, so the merge works on plain values.
 * @scope The strict shape checks and the readers of the base, patch, and preset layers.
 *  NOT: the public load and merge surface and the defaults of the layer types.
 * @invariants An absent section or field gives its default value. A present value of a wrong type is an error at load.
 * @invariants A key outside the layer type is an error at load.
 * @invariants A scope key outside the two-segment shape is an error at load, except the `{repo}` placeholder of a `git_remote` rule.
 * @dependencies types/errors.ts, domain/scope.ts, domain/config-types.ts.
 * @keywords config, read, validate, expect, layer, base, patch, preset, rule
 * #endregion moduleContract
 */

import { MemlensError } from "../types/errors.js";
import { NOTE_KINDS, type ScopeKey } from "../types/primitives.js";
import {
	type Budget,
	type CacheTtl,
	type CompactionConfig,
	DEFAULT_BUDGET,
	DEFAULT_COMPACTION,
	DEFAULT_REVIEW_DAYS,
	DEFAULT_SCOPE_DEFAULT,
	type Duration,
	type Glob,
	NUDGE_TEXTS,
	type NudgeConfig,
	type Path,
	type ProfileConfig,
	type ReviewConfig,
	type Rule,
	type ScopeDefault,
	type StoreConfig,
} from "./config-types.js";
import { validateScopeKey } from "./scope.js";

export const DURATION_RE = /^\d+[smh]$/;

export function expectRecord(
	value: unknown,
	where: string,
): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new MemlensError("Data", `${where} is not a table`);
	}
	return value as Record<string, unknown>;
}

export function expectKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
	where: string,
): void {
	for (const key of Object.keys(record)) {
		if (!allowed.includes(key)) {
			throw new MemlensError("Data", `${where} holds the unknown key ${key}`);
		}
	}
}

export function expectString(value: unknown, where: string): string {
	if (typeof value !== "string") {
		throw new MemlensError("Data", `${where} is not a string`);
	}
	return value;
}

function expectCount(value: unknown, where: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new MemlensError("Data", `${where} is not a whole number above 0`);
	}
	return value;
}

function expectOneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	where: string,
): T {
	const text = expectString(value, where);
	if (!(allowed as readonly string[]).includes(text)) {
		throw new MemlensError(
			"Data",
			`${where} is not one of ${allowed.join(", ")}`,
		);
	}
	return text as T;
}

function expectScopeKey(
	value: unknown,
	where: string,
	allowRepo: boolean,
): ScopeKey {
	const key = expectString(value, where);
	const probe = allowRepo ? key.replaceAll("{repo}", "x") : key;
	if (!validateScopeKey(probe)) {
		throw new MemlensError("Data", `${where} is not a scope key: ${key}`);
	}
	return key as ScopeKey;
}

/** @purpose Read the store section of the base layer. An absent section gives the defaults. */
export function readStore(value: unknown, defaultPath: Path): StoreConfig {
	if (value === undefined) return { path: defaultPath, idle: 300 };
	const record = expectRecord(value, "store");
	expectKeys(record, ["path", "idle"], "store");
	return {
		path:
			record.path === undefined
				? defaultPath
				: expectString(record.path, "store.path"),
		idle:
			record.idle === undefined ? 300 : expectCount(record.idle, "store.idle"),
	};
}

/** @purpose Read each named profile of the base layer. An absent or empty table gives no profile. */
export function readProfiles(value: unknown): Record<string, ProfileConfig> {
	const records = value === undefined ? {} : expectRecord(value, "profile");
	const profile: Record<string, ProfileConfig> = {};
	for (const [name, entry] of Object.entries(records)) {
		profile[name] = readProfile(entry, `profile.${name}`);
	}
	return profile;
}

function readProfile(value: unknown, where: string): ProfileConfig {
	const record = expectRecord(value, where);
	expectKeys(record, ["scopes", "budget", "subagents"], where);
	if (
		record.scopes !== undefined &&
		(!Array.isArray(record.scopes) ||
			record.scopes.some((glob) => typeof glob !== "string"))
	) {
		throw new MemlensError("Data", `${where}.scopes is not a list of globs`);
	}
	const profile: ProfileConfig = {
		scopes: (record.scopes as Glob[] | undefined) ?? ["*"],
		budget: readFullBudget(record.budget, `${where}.budget`),
	};
	if (record.subagents !== undefined) {
		profile.subagents = expectOneOf(
			record.subagents,
			["propose", "read", "off"],
			`${where}.subagents`,
		);
	}
	return profile;
}

/** @purpose Read the store section of a patch or a preset layer. */
export function readPatchStore(value: unknown): Partial<StoreConfig> {
	const record = expectRecord(value, "patch.store");
	expectKeys(record, ["path", "idle"], "patch.store");
	const store: Partial<StoreConfig> = {};
	if (record.path !== undefined)
		store.path = expectString(record.path, "patch.store.path");
	if (record.idle !== undefined)
		store.idle = expectCount(record.idle, "patch.store.idle");
	return store;
}

function readFullBudget(value: unknown, where: string): Budget {
	const partial = readBudget(value, where);
	return {
		here: partial.here ?? DEFAULT_BUDGET.here,
		directions: partial.directions ?? DEFAULT_BUDGET.directions,
	};
}

export function readBudget(value: unknown, where: string): Partial<Budget> {
	if (value === undefined) return {};
	const record = expectRecord(value, where);
	expectKeys(record, ["here", "directions"], where);
	const budget: Partial<Budget> = {};
	if (record.here !== undefined)
		budget.here = expectCount(record.here, `${where}.here`);
	if (record.directions !== undefined)
		budget.directions = expectCount(record.directions, `${where}.directions`);
	return budget;
}

export function readScopeDefault(value: unknown): ScopeDefault {
	if (value === undefined) return { ...DEFAULT_SCOPE_DEFAULT, rules: [] };
	const where = "scope_default";
	const record = expectRecord(value, where);
	expectKeys(record, ["rules", "default"], where);
	if (record.rules !== undefined && !Array.isArray(record.rules)) {
		throw new MemlensError("Data", `${where}.rules is not a list`);
	}
	const rules = (record.rules ?? []).map((rule: unknown, index: number) =>
		readRule(rule, index),
	);
	return {
		rules,
		default:
			record.default === undefined
				? DEFAULT_SCOPE_DEFAULT.default
				: expectScopeKey(record.default, `${where}.default`, false),
	};
}

function readRule(value: unknown, index: number): Rule {
	const where = `scope_default.rules[${index}]`;
	const record = expectRecord(value, where);
	if (record.match === undefined) {
		throw new MemlensError("Data", `${where}.match is absent`);
	}
	const match = expectOneOf(
		record.match,
		["git_remote", "path", "workspace"],
		`${where}.match`,
	);
	if (match === "workspace") {
		expectKeys(record, ["match", "id", "key"], where);
		return {
			match,
			id: expectString(record.id, `${where}.id`),
			key: expectScopeKey(record.key, `${where}.key`, false),
		};
	}
	expectKeys(record, ["match", "glob", "key"], where);
	return {
		match,
		glob: expectString(record.glob, `${where}.glob`),
		key: expectScopeKey(record.key, `${where}.key`, match === "git_remote"),
	};
}

export function readNudge(value: unknown): NudgeConfig {
	const partial = value === undefined ? {} : readPartialNudge(value, "nudge");
	return {
		tool_calls: partial.tool_calls ?? 10,
		turns: partial.turns ?? 10,
		text: partial.text ?? { ...NUDGE_TEXTS },
	};
}

export function readPartialNudge(
	value: unknown,
	where: string,
): Partial<NudgeConfig> {
	const record = expectRecord(value, where);
	expectKeys(record, ["tool_calls", "turns", "text"], where);
	const partial: Partial<NudgeConfig> = {};
	if (record.tool_calls !== undefined)
		partial.tool_calls = expectCount(record.tool_calls, `${where}.tool_calls`);
	if (record.turns !== undefined)
		partial.turns = expectCount(record.turns, `${where}.turns`);
	if (record.text !== undefined) partial.text = readNudgeText(record.text);
	return partial;
}

function readNudgeText(value: unknown): Record<"tool_calls" | "turns", string> {
	const record = expectRecord(value, "nudge.text");
	expectKeys(record, ["tool_calls", "turns"], "nudge.text");
	const result = {} as Record<"tool_calls" | "turns", string>;
	for (const counter of ["tool_calls", "turns"] as const) {
		const text =
			record[counter] === undefined
				? NUDGE_TEXTS[counter]
				: expectString(record[counter], `nudge.text.${counter}`);
		if (!text.includes("{n}")) {
			throw new MemlensError("Data", `nudge.text.${counter} holds no {n}`);
		}
		result[counter] = text;
	}
	return result;
}

export function readCompaction(value: unknown): CompactionConfig {
	if (value === undefined) return { ...DEFAULT_COMPACTION };
	const record = expectRecord(value, "compaction");
	expectKeys(
		record,
		["provider", "model", "effort", "mode", "batch", "maxCallsPerHour"],
		"compaction",
	);
	return {
		provider:
			record.provider === undefined
				? DEFAULT_COMPACTION.provider
				: expectString(record.provider, "compaction.provider"),
		model:
			record.model === undefined
				? DEFAULT_COMPACTION.model
				: expectString(record.model, "compaction.model"),
		effort:
			record.effort === undefined
				? DEFAULT_COMPACTION.effort
				: expectString(record.effort, "compaction.effort"),
		mode:
			record.mode === undefined
				? "auto"
				: expectOneOf(
						record.mode,
						["parallel", "batch", "auto"],
						"compaction.mode",
					),
		batch:
			record.batch === undefined
				? 6
				: expectCount(record.batch, "compaction.batch"),
		maxCallsPerHour:
			record.maxCallsPerHour === undefined
				? 120
				: expectCount(record.maxCallsPerHour, "compaction.maxCallsPerHour"),
	};
}

export function readPartialCompaction(
	value: unknown,
	where: string,
): Partial<CompactionConfig> {
	const record = expectRecord(value, where);
	expectKeys(
		record,
		["provider", "model", "effort", "mode", "batch", "maxCallsPerHour"],
		where,
	);
	const partial: Partial<CompactionConfig> = {};
	if (record.provider !== undefined)
		partial.provider = expectString(record.provider, `${where}.provider`);
	if (record.model !== undefined)
		partial.model = expectString(record.model, `${where}.model`);
	if (record.effort !== undefined)
		partial.effort = expectString(record.effort, `${where}.effort`);
	if (record.mode !== undefined)
		partial.mode = expectOneOf(
			record.mode,
			["parallel", "batch", "auto"],
			`${where}.mode`,
		);
	if (record.batch !== undefined)
		partial.batch = expectCount(record.batch, `${where}.batch`);
	if (record.maxCallsPerHour !== undefined) {
		partial.maxCallsPerHour = expectCount(
			record.maxCallsPerHour,
			`${where}.maxCallsPerHour`,
		);
	}
	return partial;
}

export function readReview(value: unknown): ReviewConfig {
	if (value === undefined) {
		return { ...DEFAULT_REVIEW_DAYS };
	}
	const record = expectRecord(value, "review");
	expectKeys(record, NOTE_KINDS, "review");
	const result = { ...DEFAULT_REVIEW_DAYS };
	for (const kind of NOTE_KINDS) {
		if (record[kind] !== undefined) {
			result[kind] = expectCount(record[kind], `review.${kind}`);
		}
	}
	return result;
}

export function readCacheTtl(value: unknown): CacheTtl {
	const record = expectRecord(value, "cacheTtl");
	const result: CacheTtl = {};
	for (const [glob, duration] of Object.entries(record)) {
		const text = expectString(duration, `cacheTtl.${glob}`);
		if (!DURATION_RE.test(text)) {
			throw new MemlensError("Data", `cacheTtl.${glob} is not a duration`);
		}
		result[glob] = text as Duration;
	}
	return result;
}
