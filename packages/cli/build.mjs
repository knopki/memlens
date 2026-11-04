import { build } from "esbuild";

// Bundle the CLI into one file, so the binary starts without the workspace.
await build({
	entryPoints: ["src/cli.ts"],
	outfile: "dist/cli.js",
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	sourcemap: true,
	banner: { js: "#!/usr/bin/env node" },
});
