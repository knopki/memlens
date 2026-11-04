import { defineConfig } from 'tsdown'

// tsdown makes lib/index.js (ESM) and lib/index.d.ts, the paths that
// package.json declares. It is also the `prepare` script for git installs.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: true,
  clean: true,
  sourcemap: false,
  outDir: 'lib',
  // Do not let tsdown write .mjs when package.json has "type": "module".
  // With .mjs output, `main` points to no file and the plugin does not load.
  fixedExtension: false,
})
