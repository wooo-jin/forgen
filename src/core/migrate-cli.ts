/**
 * Forgen v0.4.1 — `forgen migrate` CLI
 *
 * 데이터 스키마 업그레이드를 1회성으로 돌리는 관리 명령.
 * 현재 대상:
 *   - implicit-feedback: TEST-5 category 필드 백필 (type → category inference).
 *     기본은 lazy (read 시점 백필) 이지만 집계/외부 도구가 raw jsonl 을 읽는
 *     경우 영구 재기록이 필요.
 */

import { migrateImplicitFeedbackLog } from '../store/implicit-feedback-store.js';

const HELP = `
  forgen migrate — one-shot schema migrations

  Usage:
    forgen migrate implicit-feedback   category 필드가 없는 레거시 엔트리 백필 + 재기록
    forgen migrate all                 (현재는 implicit-feedback 과 동일)
    forgen migrate --help              이 도움말
`;

export async function handleMigrate(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(HELP);
    return;
  }

  if (sub === 'implicit-feedback' || sub === 'all') {
    console.log('[forgen migrate] implicit-feedback.jsonl 백필 시작...');
    const { migrated, dropped } = migrateImplicitFeedbackLog();
    console.log(`[forgen migrate] 백필 ${migrated}건, 드롭 ${dropped}건 — 재기록 완료.`);
    return;
  }

  console.error(`[forgen migrate] unknown target: ${sub}`);
  console.error(HELP);
  process.exit(1);
}
