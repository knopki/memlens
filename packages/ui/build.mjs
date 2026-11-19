import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

// Both hosts take the same rules. The standalone adds its palette and shell last.
const [source, host] = await Promise.all([
	readFile("src/console.css", "utf8"),
	readFile("src/style.css", "utf8"),
]);
const rules = source.replace(/\/\*[\s\S]*?\*\//g, "").trim();
await mkdir("dist/standalone", { recursive: true });
await Promise.all([
	copyFile("src/index.html", "dist/standalone/index.html"),
	writeFile("dist/standalone/style.css", `${rules}\n${host}`),
	writeFile(
		"dist/styles.js",
		`export const CONSOLE_RULES = ${JSON.stringify(rules)};\n`,
	),
	writeFile(
		"dist/styles.d.ts",
		"export declare const CONSOLE_RULES: string;\n",
	),
]);
