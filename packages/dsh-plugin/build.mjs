import { build } from "esbuild";

// Build the host entry and the preset entry. Bundle every dependency of this
// repository. The harness packages stay external: the host gives them at run
// time.
const HOST_PACKAGES = [
	"@deepseek-ai/cordis",
	"@deepseek-ai/cordis-plugin-loader",
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-scope",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-system-prompt",
	"@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-workspace",
];

await build({
	entryPoints: ["src/index.ts", "src/preset.ts"],
	outdir: "lib",
	bundle: true,
	external: HOST_PACKAGES.flatMap((name) => [name, `${name}/*`]),
	platform: "node",
	format: "esm",
	target: "node24",
	sourcemap: true,
});
