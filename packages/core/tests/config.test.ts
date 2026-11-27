/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the configuration layers, the defaults, and the environment paths.
 * #endregion moduleContract
 */
import { homedir } from "node:os";
import { isAbsolute, join, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import {
	expandTilde,
	globMatches,
	loadBaseConfig,
	loadPatchConfig,
	loadPresetConfig,
	nativeDirs,
	resolveConfig,
	storePath,
} from "../src/domain/config.js";
import {
	DEFAULT_REVIEW_DAYS,
	NUDGE_TEXTS,
} from "../src/domain/config-types.js";

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
	it("gives the default layer for an absent file", () => {
		expect(loadBaseConfig(null, "/store")).toEqual({
			language: "en",
			defaultProfile: "default",
			store: { path: "/store", idle: 300 },
			profile: {},
			scope_default: { rules: [], default: "project:misc" },
			nudge: { tool_calls: 10, turns: 10, text: NUDGE_TEXTS },
			compaction: {
				provider: "",
				model: "",
				effort: "",
				batch: 10,
				maxCallsPerHour: 120,
			},
			review: DEFAULT_REVIEW_DAYS,
		});
	});

	it("gives the same layer for an empty file", () => {
		expect(loadBaseConfig("", "/store")).toEqual(
			loadBaseConfig(null, "/store"),
		);
	});

	it("fills the defaults of an incomplete file", () => {
		const config = base();
		expect(config.store.path).toBe("/default/store");
		expect(config.store.idle).toBe(300);
		expect(config.language).toBe("en");
		expect(config.nudge.turns).toBe(10);
		expect(config.nudge.tool_calls).toBe(5);
		expect(config.compaction.effort).toBe("");
		expect(config.compaction.batch).toBe(10);
		expect(config.compaction.maxCallsPerHour).toBe(120);
		expect(config.review).toEqual({
			decision: 90,
			preference: 180,
			fact: 90,
			gotcha: 90,
			task: 7,
			note: 180,
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

	it("accepts a rule key with an uppercase name", () => {
		const text = configToml({
			rules: '{ match = "path", glob = "/x", key = "project:UPPER" }',
		});
		const config = loadBaseConfig(text, "/s");
		expect(config.scope_default.rules[0]?.key).toBe("project:UPPER");
	});

	it("rejects the placeholder in a path rule key", () => {
		const text = configToml({
			rules: '{ match = "path", glob = "/x", key = "project:{repo}" }',
		});
		expect(() => loadBaseConfig(text, "/s")).toThrow(/placeholder/);
	});

	it("leaves the provider empty when the section omits it", () => {
		const config = loadBaseConfig(
			configToml({ compaction: 'model = "m"' }),
			"/s",
		);
		expect(config.compaction.provider).toBe("");
		expect(config.compaction.model).toBe("m");
	});

	it("takes the batch default of 10 and no upper bound", () => {
		const text = configToml({ compaction: 'provider = "dsh"\nmodel = "m"' });
		expect(loadBaseConfig(text, "/s").compaction.batch).toBe(10);
		const read = (batch: string) =>
			loadBaseConfig(configToml({ compaction: `batch = ${batch}` }), "/s")
				.compaction.batch;
		expect(read("1")).toBe(1);
		expect(read("10")).toBe(10);
		expect(read("11")).toBe(11);
		expect(read("40")).toBe(40);
		expect(read("1000")).toBe(1000);
		for (const batch of ["0", "1.5", "-2"]) {
			expect(() =>
				loadBaseConfig(configToml({ compaction: `batch = ${batch}` }), "/s"),
			).toThrow(/compaction\.batch/);
		}
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

	it("takes a patch batch count above 10", () => {
		const patch = loadPatchConfig({ compaction: { batch: 10 } });
		expect(patch.compaction).toEqual({ batch: 10 });
		expect(loadPatchConfig({ compaction: { batch: 11 } }).compaction).toEqual({
			batch: 11,
		});
		expect(loadPatchConfig({ compaction: { batch: 40 } }).compaction).toEqual({
			batch: 40,
		});
	});

	it("rejects a patch batch count that is not a positive whole number", () => {
		for (const batch of [0, 1.5, -3]) {
			expect(() => loadPatchConfig({ compaction: { batch } })).toThrow(
				/compaction\.batch/,
			);
		}
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
			effort: "",
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

describe("paths of the environment", () => {
	it("expands a leading tilde", () => {
		expect(expandTilde("~/store", { HOME: "/home/u" }, "linux")).toBe(
			"/home/u/store",
		);
		expect(expandTilde("~", { HOME: "/home/u" }, "linux")).toBe("/home/u");
		expect(expandTilde("/abs", { HOME: "/home/u" }, "linux")).toBe("/abs");
	});

	it("expands the backslash form and the Windows home", () => {
		expect(
			expandTilde("~\\store", { USERPROFILE: "C:\\Users\\u" }, "win32"),
		).toBe("C:\\Users\\u\\store");
		expect(expandTilde("~", { USERPROFILE: "C:\\Users\\u" }, "win32")).toBe(
			"C:\\Users\\u",
		);
	});

	it("gives the linux directories", () => {
		expect(
			nativeDirs({ XDG_CONFIG_HOME: "/c", XDG_DATA_HOME: "/d" }, "linux"),
		).toEqual({
			configDir: "/c/memlens",
			dataDir: "/d/memlens",
		});
		expect(nativeDirs({ HOME: "/home/u" }, "linux")).toEqual({
			configDir: "/home/u/.config/memlens",
			dataDir: "/home/u/.local/share/memlens",
		});
	});

	it("ignores a relative or empty XDG root", () => {
		expect(
			nativeDirs(
				{ HOME: "/home/u", XDG_CONFIG_HOME: "rel", XDG_DATA_HOME: "" },
				"linux",
			),
		).toEqual({
			configDir: "/home/u/.config/memlens",
			dataDir: "/home/u/.local/share/memlens",
		});
	});

	it("gives the macOS directories", () => {
		expect(nativeDirs({ HOME: "/Users/u" }, "darwin")).toEqual({
			configDir: "/Users/u/Library/Application Support/memlens",
			dataDir: "/Users/u/Library/Application Support/memlens",
		});
	});

	it("keeps one XDG root on macOS", () => {
		expect(
			nativeDirs({ HOME: "/Users/u", XDG_DATA_HOME: "/d" }, "darwin"),
		).toEqual({
			configDir: "/Users/u/Library/Application Support/memlens",
			dataDir: "/d/memlens",
		});
	});

	it("gives the Windows directories", () => {
		expect(nativeDirs({ USERPROFILE: "C:\\Users\\u" }, "win32")).toEqual({
			configDir: "C:\\Users\\u\\AppData\\Roaming\\memlens",
			dataDir: "C:\\Users\\u\\AppData\\Local\\memlens",
		});
	});

	it("prefers the Windows program directories", () => {
		expect(
			nativeDirs(
				{
					USERPROFILE: "C:\\Users\\u",
					APPDATA: "D:\\roam",
					LOCALAPPDATA: "D:\\local",
				},
				"win32",
			),
		).toEqual({
			configDir: "D:\\roam\\memlens",
			dataDir: "D:\\local\\memlens",
		});
	});

	it("prefers the profile over a POSIX home on Windows", () => {
		expect(
			nativeDirs({ HOME: "/c/Users/u", USERPROFILE: "C:\\Users\\u" }, "win32")
				.configDir,
		).toBe("C:\\Users\\u\\AppData\\Roaming\\memlens");
	});

	it("ignores a relative home in the environment", () => {
		const linux = nativeDirs({ HOME: "." }, "linux");
		expect(isAbsolute(linux.configDir)).toBe(true);
		expect(linux.dataDir).toBe(join(homedir(), ".local", "share", "memlens"));
		expect(
			win32.isAbsolute(nativeDirs({ USERPROFILE: "rel" }, "win32").configDir),
		).toBe(true);
	});

	it("gives absolute paths with no home in the environment", () => {
		const dirs = nativeDirs({}, "linux");
		expect(isAbsolute(dirs.configDir)).toBe(true);
		expect(dirs.dataDir).toBe(join(homedir(), ".local", "share", "memlens"));
	});
});
