import { writeFile } from "node:fs/promises";
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
	"@deepseek-ai/dsh-typert-protocol",
	"@deepseek-ai/dsh-typert-registry",
	"@deepseek-ai/dsh-workspace",
	"zod",
];

await build({
	entryPoints: ["src/index.ts", "src/preset.ts"],
	outdir: "lib",
	bundle: true,
	external: HOST_PACKAGES.flatMap((name) => [name, `${name}/*`]),
	platform: "node",
	format: "esm",
	target: "node24",
});

// The Web page loads the client bundle as a classic script, before the module
// system exists. The script registers one factory under the package name, and
// the factory returns the plugin exports. React and the other baseline modules
// come from the module table of the page, so they stay external.
// Bundle the shared console rules from the UI package with the host palette.
const CLIENT_PACKAGES = [
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"zod",
];

const client = await build({
	entryPoints: ["src/client/index.tsx"],
	bundle: true,
	external: CLIENT_PACKAGES,
	platform: "browser",
	format: "cjs",
	target: "es2022",
	jsx: "automatic",
	write: false,
});

const body = client.outputFiles[0].text;
await writeFile(
	"lib/client.js",
	`window.__ModuleLoader__.load({ id: "@memlens/dsh-plugin", factory(require) {
var module = { exports: {} };
var exports = module.exports;
${body}
return module.exports;
} });
`,
);
