/**
 * Tests for the configuration layers.
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_CACHE_TTL,
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

const BASE_TOML = `
defaultProfile = "default"

[store]
backend = "sqlite"

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

[writer]
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
	parts: { rules?: string; writer?: string; nudge?: string } = {},
): string {
	return `
defaultProfile = "default"

[store]
backend = "sqlite"
path = "x"

[profile.default]
scopes = ["*"]
budget = { here = 1, directions = 1 }

[scope_default]
default = "project:misc"
${parts.rules === undefined ? "" : `rules = [${parts.rules}]`}

[writer]
${parts.writer ?? 'provider = "dsh"\nmodel = "m"'}

${parts.nudge ?? ""}
`;
}

describe("loadBaseConfig", () => {
	it("fills the defaults of an incomplete file", () => {
		const config = base();
		expect(config.store.path).toBe("/default/store");
		expect(config.store.idle).toBe(300);
		expect(config.language).toBe("en");
		expect(config.nudge.turns).toBe(10);
		expect(config.nudge.tool_calls).toBe(5);
		expect(config.writer.effort).toBe("off");
		expect(config.writer.mode).toBe("auto");
		expect(config.writer.batch).toBe(6);
		expect(config.writer.maxCallsPerHour).toBe(120);
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
			loadBaseConfig(
				'unknown = 1\n\n[store]\nbackend = "jsonl"\npath = "x"\n',
				"/s",
			),
		).toThrow(/unknown key unknown/);
	});

	it("rejects a wrong backend", () => {
		expect(() =>
			loadBaseConfig('[store]\nbackend = "redis"\npath = "x"\n', "/s"),
		).toThrow(/store.backend/);
	});

	it("rejects a profile without a budget", () => {
		const text = `
[store]
backend = "sqlite"
path = "x"

[profile.default]
scopes = ["*"]
`;
		expect(() => loadBaseConfig(text, "/s")).toThrow(/budget/);
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

	it("rejects a missing writer provider", () => {
		expect(() =>
			loadBaseConfig(configToml({ writer: 'model = "m"' }), "/s"),
		).toThrow(/writer.provider/);
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

	it("rejects a preset without a profile", () => {
		expect(() => loadPresetConfig({ budget: { here: 3 } })).toThrow(/profile/);
	});

	it("reads a preset", () => {
		const preset = loadPresetConfig({
			profile: "work",
			budget: { directions: 2 },
		});
		expect(preset.profile).toBe("work");
		expect(preset.budget).toEqual({ directions: 2 });
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

	it("rejects an unknown profile name", () => {
		expect(() =>
			resolveConfig(base(), {}, loadPresetConfig({ profile: "nope" })),
		).toThrow(/nope/);
	});
});

describe("storePath", () => {
	it("takes the flag over the environment and the file", () => {
		expect(
			storePath("/flag", "/env", { backend: "sqlite", path: "/file", idle: 1 }),
		).toBe("/flag");
	});

	it("takes the environment over the file", () => {
		expect(
			storePath(null, "/env", { backend: "sqlite", path: "/file", idle: 1 }),
		).toBe("/env");
	});

	it("takes the file last", () => {
		expect(
			storePath(null, null, { backend: "sqlite", path: "/file", idle: 1 }),
		).toBe("/file");
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
