import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

// The console is one package. Resolve its three files through the package name, so this build holds
// no path into the source tree of another package.
const consoleEntry = require.resolve("@memlens/ui/standalone");
const consolePage = require.resolve("@memlens/ui/standalone/index.html");
const consoleStyle = require.resolve("@memlens/ui/standalone/style.css");

// Bundle the CLI into one file, so the binary starts without the workspace.
await build({
	entryPoints: ["src/cli.ts"],
	outfile: "dist/cli.js",
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	banner: { js: "#!/usr/bin/env node" },
});

// Keep browser code in its own bundle.
await mkdir("dist/ui", { recursive: true });
await build({
	entryPoints: [consoleEntry],
	outfile: "dist/ui/client.js",
	bundle: true,
	platform: "browser",
	format: "esm",
	target: "es2022",
	minify: true,
});
await Promise.all([
	copyFile(consolePage, "dist/ui/index.html"),
	copyFile(consoleStyle, "dist/ui/style.css"),
]);
