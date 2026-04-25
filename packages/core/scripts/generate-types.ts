import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '..', 'schema');
const outFile = resolve(here, '..', 'src', 'ir', 'generated.ts');

const banner = `/**
 * AUTO-GENERATED. Do not edit by hand.
 * Source: packages/core/schema/*.schema.json
 * Regenerate: pnpm --filter @leclabs/agentir-core gen
 */
/* eslint-disable */
`;

const ts = await compileFromFile(resolve(schemaDir, 'ir.schema.json'), {
  cwd: schemaDir,
  bannerComment: banner,
  declareExternallyReferenced: true,
  additionalProperties: false,
  format: true,
  style: { singleQuote: true, semi: true },
});

await writeFile(outFile, ts, 'utf8');
console.log(`Wrote ${outFile} (${ts.length} bytes)`);
