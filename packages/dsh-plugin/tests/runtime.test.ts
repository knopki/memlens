/**
 * #region moduleContract
 * @purpose Check the plugin configuration inputs and the active scope rules without a harness process.
 * @scope The base file, store path precedence, path and workspace rules, and the Git inputs.
 * @invariants A missing base file gives the shared default, and another read error propagates.
 * @invariants The patch store path wins over the environment, and the environment wins over the base file.
 * @dependencies USES API: node:fs, node:child_process, node:path, @memlens/core
 * @keywords test, config, store, scope, git, memlens
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PatchConfig } from "@memlens/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	pluginActiveScope,
	pluginStorePath,
	readPluginBase,
} from "../src/runtime.js";

const BASE_CONFIG = `language = "en"
defaultProfile = "a"

[profile.a]
scopes = ["*"]

[profile.a.budget]
here = 20
directions = 10

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"

[scope_default]
default = "user:notes"
`;

const RULE_CONFIG = `${BASE_CONFIG}
[[scope_default.rules]]
match = "path"
glob = "/work/**"
key = "project:work"

[[scope_default.rules]]
match = "workspace"
id = "ws-1"
key = "project:ws"

[[scope_default.rules]]
match = "git_remote"
glob = "github.com/acme/*"
key = "project:{repo}"
`;

const hasGit = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

let rootDir: string;

let configDir: string;

let dataDir: string;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), "memlens-runtime-"));
	configDir = join(rootDir, "config");
	dataDir = join(rootDir, "data");
	mkdirSync(join(configDir, "memlens"), { recursive: true });
});

afterEach(() => {
	rmSync(rootDir, { recursive: true, force: true });
});

function env(extra: Record<string, string> = {}): Record<string, string> {
	return {
		XDG_CONFIG_HOME: configDir,
		XDG_DATA_HOME: dataDir,
		HOME: rootDir,
		...extra,
	};
}

function writeBase(text: string): void {
	writeFileSync(join(configDir, "memlens", "config.toml"), text);
}

function git(cwd: string, ...args: string[]): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("readPluginBase", () => {
	it("reads the base file from the XDG configuration directory", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(base.defaultProfile).toBe("a");
		expect(base.profile.a).toBeDefined();
	});

	it("uses the shared default when the base file is absent", () => {
		const base = readPluginBase(env()).base;
		expect(base.defaultProfile).toBe("default");
	});

	it("propagates a read error that is not ENOENT", () => {
		mkdirSync(join(configDir, "memlens", "config.toml"), { recursive: true });
		expect(() => readPluginBase(env())).toThrow();
	});

	it("states the file of the same read, so no later absence changes the claim", () => {
		writeBase(BASE_CONFIG);
		const found = readPluginBase(env(), true);
		expect(found.present).toBe(true);
		expect(found.base.defaultProfile).toBe("a");
		rmSync(join(configDir, "memlens", "config.toml"));
		// The claim belongs to the read that found the file. A later check cannot take it back.
		expect(found.present).toBe(true);
		const absent = readPluginBase(env(), true);
		expect(absent.present).toBe(false);
		expect(absent.base.defaultProfile).toBe("default");
		expect(readPluginBase(env(), true).base).toEqual(absent.base);
		expect(() => readPluginBase(env(), true, true)).toThrow();
	});
});

describe("pluginStorePath", () => {
	it.each(["patch", "environment", "base"])(
		"rejects an empty %s store path",
		(source) => {
			writeBase(BASE_CONFIG);
			const base = readPluginBase(env()).base;
			const patch: PatchConfig =
				source === "patch" ? { store: { path: "" } } : {};
			if (source === "base") base.store.path = "";
			expect(() =>
				pluginStorePath(
					base,
					patch,
					env(source === "environment" ? { MEMLENS_STORE: "" } : {}),
				),
			).toThrow(/store path is empty/);
		},
	);
	it("expands the patch path and lets it win over the environment", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		const patch: PatchConfig = { store: { path: "~/patch-store" } };
		expect(
			pluginStorePath(
				base,
				patch,
				env({ MEMLENS_STORE: join(rootDir, "env-store") }),
			),
		).toBe(join(rootDir, "patch-store"));
	});

	it("uses MEMLENS_STORE when the patch has no path", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(
			pluginStorePath(
				base,
				{},
				env({ MEMLENS_STORE: join(rootDir, "env-store") }),
			),
		).toBe(join(rootDir, "env-store"));
	});

	it("uses the base data directory when no override exists", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginStorePath(base, {}, env())).toBe(base.store.path);
	});
});

describe("pluginActiveScope", () => {
	it("uses the directory when no rule or workspace matches", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, join(rootDir, "plain"))).toBe(
			"project:plain",
		);
	});

	it("uses the workspace title before the directory", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(
			pluginActiveScope(base, join(rootDir, "plain"), "ws-1", "My-Workspace"),
		).toBe("project:My-Workspace");
	});

	it.skipIf(!hasGit)("uses the remote before the workspace title", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		const repo = join(rootDir, "local");
		mkdirSync(repo, { recursive: true });
		git(repo, "init");
		git(repo, "remote", "add", "upstream", "git@github.com:Acme/Demo.git");
		expect(pluginActiveScope(base, repo, "ws-1", "workspace")).toBe(
			"project:Acme/Demo",
		);
	});

	it("uses a matching path rule", () => {
		writeBase(RULE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, "/work/repo")).toBe("project:work");
	});

	it("uses a matching workspace rule", () => {
		writeBase(RULE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, join(rootDir, "plain"), "ws-1")).toBe(
			"project:ws",
		);
	});

	it.skipIf(!hasGit)("uses the repository name from the remote", () => {
		writeBase(RULE_CONFIG);
		const base = readPluginBase(env()).base;
		const repo = join(rootDir, "demo");
		mkdirSync(repo, { recursive: true });
		git(repo, "init");
		git(repo, "remote", "add", "origin", "https://github.com/acme/demo.git");
		expect(pluginActiveScope(base, repo)).toBe("project:demo");
	});

	it("uses a directory name with a leading period", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, join(rootDir, ".hidden"))).toBe(
			"project:.hidden",
		);
	});

	it("uses a workspace title with a leading period", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(
			pluginActiveScope(base, join(rootDir, "plain"), "ws-1", ".My-Workspace"),
		).toBe("project:.My-Workspace");
	});

	it("replaces each forbidden sign of a directory name", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, join(rootDir, "my notes"))).toBe(
			"project:my_notes",
		);
	});

	it("uses the configured default at the file system root", () => {
		writeBase(BASE_CONFIG);
		const base = readPluginBase(env()).base;
		expect(pluginActiveScope(base, "/")).toBe("user:notes");
	});

	it.skipIf(!hasGit)(
		"falls back to the repository name after an unmatched rule",
		() => {
			writeBase(BASE_CONFIG);
			const base = readPluginBase(env()).base;
			const repo = join(rootDir, "fallback-repo");
			mkdirSync(repo, { recursive: true });
			git(repo, "init");
			expect(pluginActiveScope(base, repo)).toBe("project:fallback-repo");
		},
	);
});
