#!/usr/bin/env node
/**
 * R9 A1 재실행 — production dist/hooks/stop-guard.js 를 직접 호출해
 * acknowledgeSessionBlocks + rotateIfBig 포함 v0.4.0 최종 코드로 검증한다.
 *
 * 선조건: `npm run build` 로 dist/ 가 최신이어야 함.
 *
 * FORGEN_SPIKE_RULES env 가 설정되면 production stop-guard 는 rule-store 가
 * 비어 있는 경우 spike fallback 경로로 진입 (loadStopRules). runner-r9 가
 * HOME 을 격리 임시 디렉토리로 설정해 rule-store 를 비움.
 */
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD_HOOK = path.resolve(__dirname, '..', '..', '..', '..', '..', 'dist', 'hooks', 'stop-guard.js');

// ESM import 는 top-level main() 자동 실행.
await import(PROD_HOOK);
