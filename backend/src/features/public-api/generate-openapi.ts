// src/features/public-api/generate-openapi.ts
//
// Emits the public v1 OpenAPI spec to the docs site, where
// docusaurus-plugin-openapi-docs turns it into reference pages.
//
//   npm run openapi:generate            (from backend/)
//
// Output: docs-site/static/openapi/interakt-v1.yaml
//   (under static/ so Docusaurus serves it for the spec's "Download" link, and
//    the openapi-docs plugin reads it from the same path)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { buildOpenApiDocument } from './public-api.openapi';

const here = dirname(fileURLToPath(import.meta.url));
// backend/src/features/public-api -> repo root -> docs-site/static/openapi
const outPath = resolve(here, '../../../../docs-site/static/openapi/interakt-v1.yaml');

const doc = buildOpenApiDocument();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, stringify(doc), 'utf8');

const pathCount = Object.keys(doc.paths ?? {}).length;
console.log(`✓ Wrote OpenAPI spec (${pathCount} paths) to ${outPath}`);
