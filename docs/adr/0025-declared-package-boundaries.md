# 0025. Declared package boundaries

Status: accepted.

## Context

The plugin client imported the console through a relative path into the source tree of another
package. The console imported the library the same way. The console package held no build, no entry
point, and no export map, so no name could resolve it.

Two facts limit the choice. The harness page loads the plugin client as one classic script, so the
build inlines the console. The library entry imports `node:sqlite` and `node:util`, so a browser
bundle cannot take the library root.

## Decision

Each package declares each workspace package that it imports. No relative import leaves its package.
The check `scripts/check-package-boundaries.mjs` enforces both rules, and `pnpm run lint` runs it.

The console package builds `dist` with `tsc`. It exports its entry and its two asset paths. The
plugin and the CLI declare `@memlens/ui` as a development dependency, and esbuild inlines the built
console.

The library adds the subpath `./view` for the pure text helpers. The console reads `dateSpan` from
that subpath. It reads the types from the root.

Each built package has a `prepare` script. The install runs them in the dependency order of the
workspace.

## Alternatives

- The plugin keeps the relative path. Refused, because the package name must resolve.
- The console exports its source files. Refused, because the export map would publish the internal
  file layout as a contract.
- The library root serves the browser. Refused, because the root imports Node.js modules. The
  manifest field `sideEffects` does not help. A probe still needs to resolve each re-exported module.

## Consequences

A moved file inside the console changes no consumer. A missing declaration fails the lint. A fresh
clone has the built packages after the install. The install is slower by the three builds.
