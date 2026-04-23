#!/usr/bin/env node
/**
 * R9 A1 재실행 — production dist/hooks/pre-tool-use.js 리다이렉트.
 */
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD_HOOK = path.resolve(__dirname, '..', '..', '..', '..', '..', 'dist', 'hooks', 'pre-tool-use.js');

await import(PROD_HOOK);
