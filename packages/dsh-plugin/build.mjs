import { build } from "esbuild";

// Bundle the plugin. The packages stay external: the harness gives them at run time.
await build({
	entryPoints: ["src/index.ts"],
	outfile: "lib/index.js",
	bundle: true,
	packages: "external",
	platform: "node",
	format: "esm",
	target: "node24",
	sourcemap: true,
});
