/**
 * #region moduleContract
 * @purpose Prove that each package holds its imports inside its own directory, and that it declares
 *   each workspace package that it names.
 * @scope The source files and the test files of every package below `packages/`. NOT: the build
 *   output, the manifests themselves, and the files of the repository root.
 * @invariants A relative import stays inside the directory of its package.
 * @invariants A test file may import a contract module from the directory `docs/`. A source file may
 *   not.
 * @invariants An import of `@memlens/*` is a declared dependency, a declared development
 *   dependency, or a declared peer dependency of that package.
 * @usecases A change of the package layout, and a change of an import between packages.
 * @keywords package, boundary, import, dependency, check, workspace
 * #endregion moduleContract
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The directory of the packages. The check reads every package below it. */
const PACKAGE_ROOT = "packages";

/** The name of the workspace scope. Each import of this scope must have a declaration. */
const SCOPE = "@memlens/";

/** The directory of the contract documents. A test may import a module from it. */
const DOCS = resolve("docs");

/** The name of the test directory of a package. */
const TEST_DIR = "tests";

/** The fields of a manifest that declare a package. */
const DECLARING_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
];

/** List the files below one directory. Skip the build output and the installed packages. */
function sourceFiles(dir) {
	const skip = new Set(["node_modules", "dist", "lib", "coverage"]);
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return skip.has(entry.name) ? [] : sourceFiles(path);
		}
		return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
	});
}

/** List the import paths of one file, with the line number of each path. */
function importPaths(text) {
	const paths = [];
	const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
	for (const match of text.matchAll(pattern)) {
		const line = text.slice(0, match.index).split("\n").length;
		paths.push({ path: match[1], line });
	}
	return paths;
}

/** Give true when the file is a test file. */
function isTest(file) {
	return file.split(sep).includes(TEST_DIR);
}

/** Give true when the path is inside the directory of the contract documents. */
function insideDocs(target) {
	return !relative(DOCS, target).startsWith(`..${sep}`);
}

/** Read the declared packages of one manifest. */
function declared(manifestPath) {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const names = new Set();
	for (const field of DECLARING_FIELDS) {
		for (const name of Object.keys(manifest[field] ?? {})) {
			names.add(name);
		}
	}
	return names;
}

const failures = [];
const packages = readdirSync(PACKAGE_ROOT, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
	.map((entry) => join(PACKAGE_ROOT, entry.name));

for (const packageDir of packages) {
	if (!statSync(packageDir).isDirectory()) continue;
	const manifest = join(packageDir, "package.json");
	const names = declared(manifest);
	const name = JSON.parse(readFileSync(manifest, "utf8")).name;

	for (const file of sourceFiles(packageDir)) {
		for (const { path, line } of importPaths(readFileSync(file, "utf8"))) {
			if (path.startsWith(".")) {
				const target = resolve(dirname(file), path);
				const inside = !relative(packageDir, target).startsWith(`..${sep}`);
				const contract = isTest(file) && insideDocs(target);
				if (!inside && !contract) {
					failures.push(
						`${file}:${line} imports ${path} outside ${packageDir}`,
					);
				}
				continue;
			}
			if (
				path.startsWith(SCOPE) &&
				!names.has(path.split("/").slice(0, 2).join("/"))
			) {
				failures.push(
					`${file}:${line} imports ${path}, but ${name} does not declare that package`,
				);
			}
		}
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	console.error(`${failures.length} package boundary violations`);
	process.exit(1);
}

console.log("package boundaries: ok");
