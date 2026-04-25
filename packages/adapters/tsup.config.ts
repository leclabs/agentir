import { defineConfig } from 'tsup';
import { readdirSync } from 'node:fs';

const adapters = readdirSync('./src', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const entry: Record<string, string> = {};
for (const a of adapters) {
  entry[`${a}/index`] = `src/${a}/index.ts`;
}

export default defineConfig({
  entry,
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
