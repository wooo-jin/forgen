/**
 * Forgen v0.4.1 — Extraction Notice (H2)
 *
 * `~/.forgen/state/last-auto-compound.json` 에 기록된 이전 세션의 추출 결과를
 * Stop hook 에서 1회 surface. noticeShown 플래그로 한번 보여주면 다시 안뜸.
 *
 * 목적: v0.4.0 에서 auto-compound 가 8,000+ 번 돌았는데 사용자는 0건 노출. 추출이
 *   실제로 일어났는지 사용자가 확인할 수 없었다. H2 는 "세션 종료 시 N개 패턴
 *   학습됨" 1줄을 Stop hook UI (systemMessage) 로 밀어넣는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATE_DIR } from './paths.js';

const LAST_AUTO_COMPOUND_PATH = path.join(STATE_DIR, 'last-auto-compound.json');

interface LastAutoCompoundRecord {
  sessionId: string;
  completedAt: string;
  extractedSolutions?: number;
  promotedRules?: number;
  noticeShown?: boolean;
}

/** 정상 실행이면 건너뛰기 좋게 fail-open. */
function readRecord(): LastAutoCompoundRecord | null {
  try {
    if (!fs.existsSync(LAST_AUTO_COMPOUND_PATH)) return null;
    return JSON.parse(fs.readFileSync(LAST_AUTO_COMPOUND_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Stop hook approve 경로에서 호출. 보여줄 알림이 있으면 1줄 문자열 반환하고
 * noticeShown=true 로 파일 업데이트 (한 번만 surface). 없으면 null.
 *
 * 신선도 컷오프: completedAt 이 30분 이상 지나면 stale 로 간주하고 surface 안함.
 * 이미 다른 세션에서 본 알림이 튀어나오는 걸 방지.
 */
export function takeLastExtractionNotice(nowMs: number = Date.now()): string | null {
  const record = readRecord();
  if (!record || record.noticeShown) return null;

  const completed = Date.parse(record.completedAt);
  if (!Number.isFinite(completed)) return null;
  const ageMs = nowMs - completed;
  if (ageMs > 30 * 60 * 1000) return null; // stale

  const extracted = record.extractedSolutions ?? 0;
  const promoted = record.promotedRules ?? 0;
  if (extracted === 0 && promoted === 0) {
    // 아무것도 학습되지 않았으면 노이즈. 알림을 소비한 상태로만 마킹.
    try {
      fs.writeFileSync(
        LAST_AUTO_COMPOUND_PATH,
        JSON.stringify({ ...record, noticeShown: true }),
      );
    } catch { /* fail-open */ }
    return null;
  }

  // 마킹 — race 는 있으나 double-notice 가 치명적이지 않음 (fail-open).
  try {
    fs.writeFileSync(
      LAST_AUTO_COMPOUND_PATH,
      JSON.stringify({ ...record, noticeShown: true }),
    );
  } catch { /* fail-open */ }

  const parts: string[] = [];
  if (extracted > 0) parts.push(`${extracted}개 패턴 추출`);
  if (promoted > 0) parts.push(`${promoted}개 규칙 승격`);
  return `[Forgen] 🧠 세션 학습 완료 — ${parts.join(', ')}`;
}
