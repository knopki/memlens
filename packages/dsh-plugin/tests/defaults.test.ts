/**
 * #region moduleContract
 * @purpose Check that the plugin starts a session from each default state of the customer machine.
 * @scope The host entry and the preset entry under a missing or partial base file.
 * @invariants Tests use temporary XDG directories and make no model call.
 * @invariants Each scenario loads the real entries, so a regression blocks the harness again.
 * #endregion moduleContract
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Service } from "@deepseek-ai/cordis";
import { createScope } from "@deepseek-ai/dsh-scope";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as host from "../src/index.js";
import * as preset from "../src/preset.js";

const roots: Context[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await root.fiber.dispose();
	vi.unstubAllEnvs();
});

// #region CLASS_MetadataLlm
/** @purpose Supply exact model metadata without a provider request. */
class MetadataLlm extends Service {
	constructor(ctx: Context) {
		super(ctx, "llm");
	}

	async resolveModelInfo(provider: string, id: string) {
		return { provider, id, name: id, context: { contextWindow: 131_072 } };
	}
}
// #endregion CLASS_MetadataLlm

// #region FUNC_composition
/**
 * @purpose Start the real host entry under one base file state.
 * @param baseText - The content of `config.toml`. An absent value creates no file.
 * @returns The root context and the temporary directory.
 */
async function composition(baseText?: string) {
	const directory = mkdtempSync(join(tmpdir(), "memlens-defaults-"));
	if (baseText !== undefined) {
		mkdirSync(join(directory, "memlens"));
		writeFileSync(join(directory, "memlens", "config.toml"), baseText);
	}
	vi.stubEnv("XDG_CONFIG_HOME", directory);
	vi.stubEnv("XDG_DATA_HOME", directory);
	vi.stubEnv("MEMLENS_STORE", undefined);
	const root = new Context();
	roots.push(root);
	await root.plugin(MetadataLlm);
	return { root, directory };
}
// #endregion FUNC_composition

describe("default states of the customer machine", () => {
	it("starts with no base file", async () => {
		const { root } = await composition();
		await root.plugin(host, {});
		expect(root.get("memlens")).toBeTruthy();
	});

	it("starts when a profile states no budget", async () => {
		const { root } = await composition(
			'defaultProfile = "x"\n[profile.x]\nscopes = ["*"]\n',
		);
		await root.plugin(host, {});
		const memory = root.get("memlens");
		expect(memory).toBeTruthy();
		expect(memory?.resolved.budget).toEqual({ here: 20, directions: 10 });
	});

	it("starts when the file states no scope_default", async () => {
		const { root } = await composition(
			'defaultProfile = "x"\n[profile.x]\nscopes = ["*"]\n[profile.x.budget]\nhere = 5\ndirections = 5\n',
		);
		await root.plugin(host, {});
		expect(root.get("memlens")).toBeTruthy();
	});

	it("starts when the file states no store section", async () => {
		const { root } = await composition(
			"[profile.tight.budget]\nhere = 3\ndirections = 2\n",
		);
		await root.plugin(host, {});
		expect(root.get("memlens")).toBeTruthy();
	});

	it("starts a preset row that states no profile", async () => {
		const { root } = await composition();
		await root.plugin(host, {});
		const scope = createScope(root, {});
		await scope.ctx.plugin(preset, {});
		expect(root.get("memlens")).toBeTruthy();
	});

	it("starts with the default layer when the harness row holds an invalid value", async () => {
		const { root } = await composition();
		const row = { budget: { here: "ten" } } as unknown as Parameters<
			typeof host.apply
		>[1];
		await root.plugin(host, row);
		const memory = root.get("memlens");
		expect(memory).toBeTruthy();
		expect(memory?.resolved.budget).toEqual({ here: 20, directions: 10 });
	});

	it("starts with the default base when the file holds an invalid value", async () => {
		const { root } = await composition("language = 4\n");
		await root.plugin(host, {});
		const memory = root.get("memlens");
		expect(memory).toBeTruthy();
		expect(memory?.base.language).toBe("en");
	});
});
