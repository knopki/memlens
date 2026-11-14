import { build } from "esbuild";

// Build the host entry and the preset entry. The packages stay external: the
// harness gives them at run time.
await build({
	entryPoints: ["src/index.ts", "src/preset.ts"],
	outdir: "lib",
	bundle: true,
	packages: "external",
	platform: "node",
	format: "esm",
	target: "node24",
	sourcemap: true,
});
