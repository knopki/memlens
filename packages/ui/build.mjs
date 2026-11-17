import { copyFile, mkdir } from "node:fs/promises";

// TypeScript emits no HTML page and no stylesheet. Copy the two assets of the standalone console
// beside the entry point, so the package dist holds the complete console.
await mkdir("dist/standalone", { recursive: true });
await Promise.all(
	["index.html", "style.css"].map((name) =>
		copyFile(`src/${name}`, `dist/standalone/${name}`),
	),
);
