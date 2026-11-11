import { copyFile, mkdir } from "node:fs/promises";
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

// Keep browser code in its own bundle.
await mkdir("dist/ui", { recursive: true });
await build({
	entryPoints: ["../ui/src/client.ts"],
	outfile: "dist/ui/client.js",
	bundle: true,
	platform: "browser",
	format: "esm",
	target: "es2022",
	minify: true,
});
await Promise.all(
	["index.html", "style.css"].map((name) =>
		copyFile(`../ui/src/${name}`, `dist/ui/${name}`),
	),
);
