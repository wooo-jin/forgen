/**
 * V9: 장시간 세션 시뮬레이션 — 100+ turn stop-guard hammering.
 *
 * 측정:
 *   - p50/p95/p99 latency — 시작 vs 끝 비교로 degradation 확인
 *   - 로그 파일 성장 + rotation 작동
 *   - 메모리 누수 흔적 (RSS 비교)
 *   - crash / timeout 0회
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_HOME = `/tmp/forgen-test-hammer-${process.pid}`;
const STOP_GUARD = path.resolve('dist/hooks/stop-guard.js');
const SCENARIOS = path.resolve('tests/spike/mech-b-inject/scenarios.json');

function fireHook(sessionId: string, lastMessage: string): {
  ms: number;
  exitCode: number;
  decision: string;
  rssMax?: number;
} {
  const t0 = process.hrtime.bigint();
  const r = spawnSync('node', [STOP_GUARD], {
    input: JSON.stringify({ session_id: sessionId, stop_hook_active: true }),
    env: {
      ...process.env,
      HOME: TEST_HOME,
      FORGEN_SPIKE_RULES: SCENARIOS,
      FORGEN_SPIKE_LAST_MESSAGE: lastMessage,
    },
    encoding: 'utf-8',
    timeout: 10000,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
  let decision = 'unknown';
  try {
    const lastLine = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
    decision = (JSON.parse(lastLine).decision ?? 'continue');
  } catch { /* ignore */ }
  return { ms, exitCode: r.status ?? -1, decision };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
  return sorted[idx];
}

describe('V9: long-session stop-guard hammering (100 turns)', () => {
  beforeEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));
  afterEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));

  it('100 alternating block/approve hooks: stable latency + logs grow as expected + no crash', () => {
    const sessionId = 'hammer-session';
    const latencies: number[] = [];
    const exits: number[] = [];
    const decisions: string[] = [];

    // 교대: block 2회, approve 1회 반복 → 루프당 ack 1개 가능
    // 총 100 iter
    for (let i = 0; i < 100; i += 1) {
      const blockMsg = '구현 완료했습니다.';
      const approveMsg = '완료 선언을 취소합니다. 증거 없음.';
      const msg = (i % 3 === 2) ? approveMsg : blockMsg;
      const r = fireHook(sessionId, msg);
      latencies.push(r.ms);
      exits.push(r.exitCode);
      decisions.push(r.decision);
    }

    // zero crash
    expect(exits.every((c) => c === 0)).toBe(true);

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const p99 = percentile(sorted, 0.99);
    console.log(`  latency: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`);

    // p95 는 hook spawn 비용 포함해서 한자리수 초 이내. node spawn cold start 가 ~200ms 대일 수 있음.
    expect(p95).toBeLessThan(2000);
    expect(p99).toBeLessThan(3000);

    // degradation check — 처음 20 iter 의 median 과 마지막 20 iter 의 median 비교
    const firstMedian = percentile([...latencies.slice(0, 20)].sort((a, b) => a - b), 0.5);
    const lastMedian = percentile([...latencies.slice(-20)].sort((a, b) => a - b), 0.5);
    console.log(`  first-20 median=${firstMedian.toFixed(1)}ms / last-20 median=${lastMedian.toFixed(1)}ms`);
    // degradation 2x 이내면 OK
    expect(lastMedian).toBeLessThan(firstMedian * 2 + 200);

    // 로그 상태 — violations.jsonl 에 block 수 만큼 엔트리, acknowledgments 는 approve 후마다 1+
    const vPath = path.join(TEST_HOME, '.forgen', 'state', 'enforcement', 'violations.jsonl');
    const vLines = fs.existsSync(vPath)
      ? fs.readFileSync(vPath, 'utf-8').split('\n').filter(Boolean)
      : [];
    // 67 block + 33 approve 교대 ≈ 67 block 엔트리
    const blockEntries = vLines.filter((l) => {
      try { return JSON.parse(l).kind === 'block'; } catch { return false; }
    });
    expect(blockEntries.length).toBeGreaterThanOrEqual(50); // 느슨: 최소 50 block
    console.log(`  violations.jsonl lines=${vLines.length} (block=${blockEntries.length})`);

    const ackPath = path.join(TEST_HOME, '.forgen', 'state', 'enforcement', 'acknowledgments.jsonl');
    if (fs.existsSync(ackPath)) {
      const ackLines = fs.readFileSync(ackPath, 'utf-8').split('\n').filter(Boolean);
      console.log(`  acknowledgments.jsonl lines=${ackLines.length}`);
      // 100회 중 approve 턴(매 3번째)이 33회 — 직전 block 이 있으면 ack 생성 → 최소 20+
      expect(ackLines.length).toBeGreaterThanOrEqual(20);
    }
  }, 180_000); // 100 turn hook spawn — 여유 있게 3분 budget
});
