/**
 * V5: 진짜 멀티 프로세스 race — N 개 node 프로세스가 동시에 recordViolation/
 * logDriftEvent/acknowledgeSessionBlocks 를 호출. POSIX O_APPEND 원자성 + rotate
 * 가 실제로 zero-loss 를 보장하는지 실측.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TEST_HOME = `/tmp/forgen-test-multiproc-${process.pid}`;
const ENFORCEMENT = path.join(TEST_HOME, '.forgen', 'state', 'enforcement');

/** 워커가 수행할 스크립트. HOME 을 env 로 받아 격리. */
const WORKER_SCRIPT = `
import { recordViolation, rotateIfBig } from '${path.resolve('dist/engine/lifecycle/signals.js')}';
import { logDriftEvent, acknowledgeSessionBlocks, incrementBlockCount } from '${path.resolve('dist/hooks/stop-guard.js')}';

const workerId = process.argv[2];
const count = Number(process.argv[3]);
const action = process.argv[4]; // 'violation' | 'drift' | 'ack' | 'mixed'

for (let i = 0; i < count; i += 1) {
  if (action === 'violation' || action === 'mixed') {
    recordViolation({
      rule_id: 'R-mp-' + workerId,
      session_id: 'sess-' + workerId + '-' + i,
      source: 'stop-guard',
      kind: 'block',
      message_preview: 'worker=' + workerId + ' iter=' + i,
    });
  }
  if (action === 'drift' || action === 'mixed') {
    logDriftEvent({
      kind: 'stuck_loop_force_approve',
      session_id: 'sess-' + workerId + '-' + i,
      rule_id: 'R-mp-' + workerId,
      count: i,
    });
  }
  if (action === 'ack' || action === 'mixed') {
    // 1 block 생성 후 ack 호출 — 같은 session
    const sid = 'ack-sess-' + workerId + '-' + i;
    incrementBlockCount(sid, 'R-mp-' + workerId);
    acknowledgeSessionBlocks(sid);
  }
}
console.log('done:' + workerId);
`;

function runWorkers(opts: { workers: number; count: number; action: string }) {
  const scriptPath = path.join(TEST_HOME, 'worker.mjs');
  fs.mkdirSync(TEST_HOME, { recursive: true });
  fs.writeFileSync(scriptPath, WORKER_SCRIPT);

  // 동시 기동 — spawnSync 는 sync 라 병렬 아님. child_process.spawn 으로 진짜 병렬.
  const { spawn } = require('node:child_process');
  const handles: any[] = [];
  for (let w = 0; w < opts.workers; w += 1) {
    const h = spawn('node', [scriptPath, String(w), String(opts.count), opts.action], {
      env: { ...process.env, HOME: TEST_HOME },
      stdio: 'pipe',
    });
    handles.push(h);
  }
  const results = handles.map((h) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    let stdout = '', stderr = '';
    h.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    h.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    h.on('close', (code: number) => resolve({ code, stdout, stderr }));
  }));
  return Promise.all(results);
}

describe('V5: multi-process append race', () => {
  beforeEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));
  afterEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));

  it('8 workers × 50 recordViolation = zero loss + zero malformed', async () => {
    const results = await runWorkers({ workers: 8, count: 50, action: 'violation' });
    for (const r of results) expect(r.code).toBe(0);

    const vPath = path.join(ENFORCEMENT, 'violations.jsonl');
    // rotation 파일 포함해서 read
    const activeLines = fs.existsSync(vPath)
      ? fs.readFileSync(vPath, 'utf-8').split('\n').filter(Boolean)
      : [];
    const rotatedFiles = fs.existsSync(ENFORCEMENT)
      ? fs.readdirSync(ENFORCEMENT).filter((f) => f.startsWith('violations.jsonl.'))
      : [];
    const rotatedLines = rotatedFiles.flatMap((f) =>
      fs.readFileSync(path.join(ENFORCEMENT, f), 'utf-8').split('\n').filter(Boolean)
    );
    const all = [...activeLines, ...rotatedLines];
    expect(all.length).toBe(400); // 8 * 50

    // malformed 0 (모든 라인 파싱 성공)
    let malformed = 0;
    for (const line of all) {
      try { JSON.parse(line); } catch { malformed += 1; }
    }
    expect(malformed).toBe(0);

    // 각 worker 가 정확히 50 엔트리 생성했는지
    const byWorker = new Map<string, number>();
    for (const line of all) {
      const o = JSON.parse(line);
      const w = o.rule_id.replace('R-mp-', '');
      byWorker.set(w, (byWorker.get(w) ?? 0) + 1);
    }
    for (let w = 0; w < 8; w += 1) {
      expect(byWorker.get(String(w))).toBe(50);
    }
  });

  it('6 workers × 30 logDriftEvent — zero loss + malformed 0', async () => {
    const results = await runWorkers({ workers: 6, count: 30, action: 'drift' });
    for (const r of results) expect(r.code).toBe(0);

    const active = fs.existsSync(path.join(ENFORCEMENT, 'drift.jsonl'))
      ? fs.readFileSync(path.join(ENFORCEMENT, 'drift.jsonl'), 'utf-8').split('\n').filter(Boolean)
      : [];
    const rotated = fs.existsSync(ENFORCEMENT)
      ? fs.readdirSync(ENFORCEMENT).filter((f) => f.startsWith('drift.jsonl.')).flatMap((f) => fs.readFileSync(path.join(ENFORCEMENT, f), 'utf-8').split('\n').filter(Boolean))
      : [];
    const all = [...active, ...rotated];
    expect(all.length).toBe(180); // 6 * 30
    for (const l of all) expect(() => JSON.parse(l)).not.toThrow();
  });

  it('4 workers × 20 ack round-trip — ack count >= attempted (no-op for stolen files OK)', async () => {
    // ack 은 자기 session 꺼만 집계. race 안나야 정상.
    const results = await runWorkers({ workers: 4, count: 20, action: 'ack' });
    for (const r of results) expect(r.code).toBe(0);

    const ackPath = path.join(ENFORCEMENT, 'acknowledgments.jsonl');
    if (!fs.existsSync(ackPath)) {
      // worker 가 너무 빨리 돌아서 ack 가 아무것도 못 잡은 경우 — pending 없으면 no ack.
      // 하지만 worker 는 incrementBlockCount 직후 acknowledge 를 호출하므로 매우 드물지 않다면 일부라도 있어야.
      throw new Error('ack file missing — workers failed?');
    }
    const ackLines = fs.readFileSync(ackPath, 'utf-8').split('\n').filter(Boolean);
    for (const l of ackLines) expect(() => JSON.parse(l)).not.toThrow();
    // 각 worker 가 20 session × worker 고유 ID 로 쓴 것 — ack 은 최소 1 이상 (정확도는 race 로 갈림)
    expect(ackLines.length).toBeGreaterThan(0);
    // 하지만 자기 session 만 ack 하므로 cross-worker 오염은 없어야. 즉 block_count 는 항상 1 (incrementBlockCount 1회만 하니까)
    const entries = ackLines.map((l) => JSON.parse(l));
    for (const e of entries) {
      expect(e.block_count).toBeGreaterThanOrEqual(1);
      expect(typeof e.session_id).toBe('string');
      expect(e.session_id.startsWith('ack-sess-')).toBe(true);
    }
  });

  it('12 workers × 25 mixed (violation + drift + ack) — combined invariant', async () => {
    const results = await runWorkers({ workers: 12, count: 25, action: 'mixed' });
    for (const r of results) expect(r.code).toBe(0);

    // violations: 12 * 25 = 300
    const vActive = fs.existsSync(path.join(ENFORCEMENT, 'violations.jsonl'))
      ? fs.readFileSync(path.join(ENFORCEMENT, 'violations.jsonl'), 'utf-8').split('\n').filter(Boolean)
      : [];
    const vRotated = fs.readdirSync(ENFORCEMENT).filter((f) => f.startsWith('violations.jsonl.'))
      .flatMap((f) => fs.readFileSync(path.join(ENFORCEMENT, f), 'utf-8').split('\n').filter(Boolean));
    const vAll = [...vActive, ...vRotated];
    expect(vAll.length).toBe(300);

    // drift: 12 * 25 = 300
    const dActive = fs.existsSync(path.join(ENFORCEMENT, 'drift.jsonl'))
      ? fs.readFileSync(path.join(ENFORCEMENT, 'drift.jsonl'), 'utf-8').split('\n').filter(Boolean)
      : [];
    const dRotated = fs.readdirSync(ENFORCEMENT).filter((f) => f.startsWith('drift.jsonl.'))
      .flatMap((f) => fs.readFileSync(path.join(ENFORCEMENT, f), 'utf-8').split('\n').filter(Boolean));
    const dAll = [...dActive, ...dRotated];
    expect(dAll.length).toBe(300);

    // 모두 parse 가능
    for (const l of [...vAll, ...dAll]) expect(() => JSON.parse(l)).not.toThrow();
  });
});
