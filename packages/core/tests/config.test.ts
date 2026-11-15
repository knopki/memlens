/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the configuration layers, the defaults, and the environment paths.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	expandTilde,
	globMatches,
	loadBaseConfig,
	loadPatchConfig,
	loadPresetConfig,
	parseDuration,
	resolveConfig,
	storePath,
	ttlSeconds,
	xdgDirs,
} from "../src/domain/config.js";
import { DEFAULT_CACHE_TTL } from "../src/domain/config-types.js";

const BASE_TOML = `
defaultProfile = "default"

[store]

[profile.default]
scopes = ["global:prefs", "project:dsh/*", "project:acme/*", "agent:default"]
subagents = "read"
budget = { here = 40, directions = 8 }

[profile.work]
scopes = ["global:work-rules", "project:acme/*"]
budget = { here = 24, directions = 4 }

[scope_default]
default = "project:misc"
rules = [
  { match = "git_remote", glob = "github.com/knopki/*", key = "project:{repo}" },
  { match = "path", glob = "/home/*/acme/*", key = "project:acme/x" },
  { match = "workspace", id = "ws_01H", key = "project:dsh/optmem" },
]

[nudge]
tool_calls = 5

[compaction]
provider = "dsh"
model = "deepseek/deepseek-chat"

[review]
fact = 90
`;

function base() {
	return loadBaseConfig(BASE_TOML, "/default/store");
}

/** A minimal valid base file. Each part replaces one section of the text. */
function configToml(
	parts: { rules?: string; compaction?: string; nudge?: string } = {},
): string {
	return `
defaultProfile = "default"

[store]
path = "x"

[profile.default]
scopes = ["*"]
budget = { here = 1, directions = 1 }

[scope_default]
default = "project:misc"
${parts.rules === undefined ? "" : `rules = [${parts.rules}]`}

[compaction]
${parts.compaction ?? 'provider = "dsh"\nmodel = "m"'}

${parts.nudge ?? ""}
`;
}

describe("loadBaseConfig", () => {
	it("loads an empty file with each default", () => {
		const config = loadBaseConfig("", "/default/store");
		expect(config.language).toBe("en");
		expect(config.defaultProfile).toBe("default");
		expect(config.store).toEqual({ path: "/default/store", idle: 300 });
		expect(config.profile).toEqual({});
		expect(config.scope_default).toEqual({ rules: [], default: "user:notes" });
		expect(config.compaction.provider).toBe("deepseek");
		expect(config.compaction.model).toBe("deepseek-chat");
	});

	it("fills the defaults of an incomplete file", () => {
		const config = base();
		expect(config.store.path).toBe("/default/store");
		expect(config.store.idle).toBe(300);
		expect(config.language).toBe("en");
		expect(config.nudge.turns).toBe(10);
		expect(config.nudge.tool_calls).toBe(5);
		expect(config.compaction.effort).toBe("off");
		expect(config.compaction.mode).toBe("auto");
		expect(config.compaction.batch).toBe(6);
		expect(config.compaction.maxCallsPerHour).toBe(120);
		expect(config.review).toEqual({
			decision: 365,
			preference: 365,
			fact: 90,
			task: 7,
			note: 365,
		});
		expect(config.profile.work.subagents).toBeUndefined();
	});

	it("keeps the given values", () => {
		const config = base();
		expect(config.profile.default.subagents).toBe("read");
		expect(config.profile.default.budget).toEqual({ here: 40, directions: 8 });
		expect(config.scope_default.rules).toHaveLength(3);
		expect(config.scope_default.default).toBe("project:misc");
	});

	it("rejects an unknown key", () => {
		expect(() =>
			loadBaseConfig('unknown = 1\n\n[store]\npath = "x"\n', "/s"),
		).toThrow(/unknown key unknown/);
	});

	it("rejects the removed backend key", () => {
		expect(() =>
			loadBaseConfig(
				configToml().replace('path = "x"', 'path = "x"\nbackend = "sqlite"'),
				"/s",
			),
		).toThrow(/unknown key/);
	});

	it("fills the default budget of a profile without a budget", () => {
		const text = `
[store]
path = "x"

[profile.default]
scopes = ["*"]
`;
		const config = loadBaseConfig(text, "/s");
		expect(config.profile.default.budget).toEqual({ here: 20, directions: 10 });
	});

	it("rejects a rule key with an uppercase name", () => {
		const text = configToml({
			rules: '{ match = "path", glob = "/x", key = "project:UPPER" }',
		});
		expect(() => loadBaseConfig(text, "/s")).toThrow(/scope key/);
	});

	it("rejects the placeholder in a path rule key", () => {
		const text = configToml({
			rules: '{ match = "path", glob = "/x", key = "project:{repo}" }',
		});
		expect(() => loadBaseConfig(text, "/s")).toThrow(/scope key/);
	});

	it("fills the default compaction route when the section omits the provider", () => {
		const config = loadBaseConfig(
			configToml({ compaction: 'model = "m"' }),
			"/s",
		);
		expect(config.compaction.provider).toBe("deepseek");
		expect(config.compaction.model).toBe("m");
	});

	it("rejects a nudge text without {n}", () => {
		const text = configToml({
			nudge: '[nudge.text]\ntool_calls = "no placeholder"',
		});
		expect(() => loadBaseConfig(text, "/s")).toThrow(/\{n\}/);
	});
});

describe("loadPatchConfig and loadPresetConfig", () => {
	it("reads the given keys only", () => {
		const patch = loadPatchConfig({
			budget: { here: 12 },
			customPrompt: "<x>{{append}}</x>",
		});
		expect(patch.budget).toEqual({ here: 12 });
		expect(patch.customPrompt).toBe("<x>{{append}}</x>");
	});

	it("rejects an unknown patch key", () => {
		expect(() => loadPatchConfig({ scopes: ["*"] })).toThrow(/unknown key/);
	});

	it("reads the compaction section of a patch", () => {
		const patch = loadPatchConfig({ compaction: { model: "m", batch: 2 } });
		expect(patch.compaction).toEqual({ model: "m", batch: 2 });
	});

	it("reads a preset without a profile", () => {
		const preset = loadPresetConfig({ budget: { here: 3 } });
		expect(preset.profile).toBeUndefined();
		expect(preset.budget).toEqual({ here: 3 });
	});

	it("reads a preset", () => {
		const preset = loadPresetConfig({
			profile: "work",
			budget: { directions: 2 },
		});
		expect(preset.profile).toBe("work");
		expect(preset.budget).toEqual({ directions: 2 });
	});

	it("rejects the compaction key of a preset", () => {
		expect(() =>
			loadPresetConfig({
				profile: "work",
				compaction: { model: "m" },
			}),
		).toThrow(/unknown key compaction/);
	});
});

describe("resolveConfig", () => {
	it("resolves the default profile with the defaults", () => {
		const resolved = resolveConfig(base(), {}, null);
		expect(resolved.defaultProfile).toBe("default");
		expect(resolved.profile.subagents).toBe("read");
		expect(resolved.budget).toEqual({ here: 40, directions: 8 });
		expect(resolved.cacheTtl).toEqual(DEFAULT_CACHE_TTL);
		expect(resolved.customPrompt).toBeNull();
	});

	it("fills the subagent default", () => {
		const resolved = resolveConfig(
			base(),
			{},
			loadPresetConfig({ profile: "work" }),
		);
		expect(resolved.profile.subagents).toBe("propose");
		expect(resolved.profile.scopes).toContain("global:work-rules");
	});

	it("lets the patch override the budget in part", () => {
		const resolved = resolveConfig(base(), { budget: { here: 12 } }, null);
		expect(resolved.budget).toEqual({ here: 12, directions: 8 });
	});

	it("takes the compaction route from the base and the patch only", () => {
		const resolved = resolveConfig(
			base(),
			{ compaction: { model: "patch-model", batch: 2 } },
			loadPresetConfig({ profile: "work", nudge: { turns: 3 } }),
		);
		expect(resolved.compaction).toEqual({
			provider: "dsh",
			model: "patch-model",
			effort: "off",
			mode: "auto",
			batch: 2,
			maxCallsPerHour: 120,
		});
	});

	it("lets the preset win over the patch", () => {
		const resolved = resolveConfig(
			base(),
			{ customPrompt: "patch" },
			loadPresetConfig({ profile: "default", customPrompt: "preset" }),
		);
		expect(resolved.customPrompt).toBe("preset");
	});

	it("merges the cache TTL map", () => {
		const resolved = resolveConfig(
			base(),
			{ cacheTtl: { "deepseek/*": "5m" } },
			null,
		);
		expect(resolved.cacheTtl["deepseek/*"]).toBe("5m");
		expect(resolved.cacheTtl["anthropic/*"]).toBe("5m");
	});

	it("resolves an unknown profile name to the default profile values", () => {
		const resolved = resolveConfig(
			base(),
			{},
			loadPresetConfig({ profile: "nope" }),
		);
		expect(resolved.defaultProfile).toBe("nope");
		expect(resolved.profile.scopes).toEqual(["*"]);
		expect(resolved.profile.budget).toEqual({ here: 20, directions: 10 });
	});
});

describe("storePath", () => {
	it("takes the flag over the environment and the file", () => {
		expect(storePath("/flag", "/env", { path: "/file", idle: 1 })).toBe(
			"/flag",
		);
	});

	it("takes the environment over the file", () => {
		expect(storePath(null, "/env", { path: "/file", idle: 1 })).toBe("/env");
	});

	it("takes the file last", () => {
		expect(storePath(null, null, { path: "/file", idle: 1 })).toBe("/file");
	});
});

describe("parseDuration", () => {
	it("parses each unit", () => {
		expect(parseDuration("120s")).toBe(120);
		expect(parseDuration("5m")).toBe(300);
		expect(parseDuration("2h")).toBe(7200);
	});

	it("rejects a value without a unit", () => {
		expect(() => parseDuration("2")).toThrow();
		expect(() => parseDuration("2x")).toThrow();
	});
});

describe("globMatches", () => {
	it("matches a star over any text", () => {
		expect(globMatches("project:dsh/*", "project:dsh/optmem")).toBe(true);
		expect(globMatches("project:dsh/*", "project:acme/x")).toBe(false);
		expect(globMatches("*:prefs", "global:prefs")).toBe(true);
		expect(globMatches("*", "project:dsh/optmem")).toBe(true);
	});

	it("matches an exact value", () => {
		expect(globMatches("deepseek/chat", "deepseek/chat")).toBe(true);
		expect(globMatches("deepseek/chat", "deepseek/v3")).toBe(false);
	});
});

describe("ttlSeconds", () => {
	it("takes the family glob before the star", () => {
		expect(ttlSeconds(DEFAULT_CACHE_TTL, "deepseek/deepseek-chat")).toBe(7200);
		expect(ttlSeconds(DEFAULT_CACHE_TTL, "anthropic/claude")).toBe(300);
		expect(ttlSeconds(DEFAULT_CACHE_TTL, "openai/gpt")).toBe(3600);
	});

	it("takes the most specific glob", () => {
		const map = {
			...DEFAULT_CACHE_TTL,
			"deepseek/chat": "30m",
		} satisfies Record<string, string>;
		expect(ttlSeconds(map, "deepseek/chat")).toBe(1800);
		expect(ttlSeconds(map, "deepseek/v3")).toBe(7200);
	});
});

describe("paths of the environment", () => {
	it("expands a leading tilde", () => {
		expect(expandTilde("~/store", { HOME: "/home/u" })).toBe("/home/u/store");
		expect(expandTilde("~", { HOME: "/home/u" })).toBe("/home/u");
		expect(expandTilde("/abs", { HOME: "/home/u" })).toBe("/abs");
	});

	it("gives the xdg directories", () => {
		expect(xdgDirs({ XDG_CONFIG_HOME: "/c", XDG_DATA_HOME: "/d" })).toEqual({
			configDir: "/c/memlens",
			dataDir: "/d/memlens",
		});
		expect(xdgDirs({ HOME: "/home/u" })).toEqual({
			configDir: "/home/u/.config/memlens",
			dataDir: "/home/u/.local/share/memlens",
		});
	});
});
