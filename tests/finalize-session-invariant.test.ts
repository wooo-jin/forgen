import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-finalize-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { appendPending, finalizeSession } = await import('../src/engine/solution-outcomes.js');
const { STATE_DIR, OUTCOMES_DIR } = await import('../src/core/paths.js');

function readOutcomeFile(sessionId: string): Array<Record<string, unknown>> {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const p = path.join(OUTCOMES_DIR, `${sanitized}.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/**
 * Invariant: session 종료 시 pending outcome은 `unknown`으로 finalize된다.
 * 프로덕션 hook 경로(context-guard.ts의 Stop 분기)에서 finalizeSession이
 * 호출되지 않으면 다음 세션의 flushAccept가 pending을 accept로 쓸어담아
 * optimistic bias가 구조적으로 발생한다. 이 테스트는 그 bias를 잠근다.
 */
describe('finalizeSession invariant: production wiring', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('finalizeSession은 pending을 unknown outcome으로 전환한다', () => {
    const sessionId = 'test-session-1';
    appendPending(sessionId, [
      { solution: 'sol-a', match_score: 0.8, injected_chars: 100 },
      { solution: 'sol-b', match_score: 0.7, injected_chars: 50 },
    ]);

    const finalized = finalizeSession(sessionId);
    expect(finalized).toBe(2);

    const events = readOutcomeFile(sessionId);
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.outcome).toBe('unknown');
      expect(e.attribution).toBe('session_end');
    }
  });

  it('finalizeSession 후 pending 파일은 사라진다', () => {
    const sessionId = 'test-session-2';
    appendPending(sessionId, [
      { solution: 'sol-c', match_score: 0.9, injected_chars: 200 },
    ]);

    const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pendingPath = path.join(STATE_DIR, `outcome-pending-${sanitized}.json`);
    expect(fs.existsSync(pendingPath)).toBe(true);

    finalizeSession(sessionId);
    expect(fs.existsSync(pendingPath)).toBe(false);
  });

  it('pending이 비어 있어도 에러 없이 0 반환 (idempotent)', () => {
    const result = finalizeSession('empty-session');
    expect(result).toBe(0);
  });

  it('finalize 후 다시 호출해도 안전 (idempotent)', () => {
    const sessionId = 'test-session-3';
    appendPending(sessionId, [
      { solution: 'sol-d', match_score: 0.5, injected_chars: 30 },
    ]);
    expect(finalizeSession(sessionId)).toBe(1);
    expect(finalizeSession(sessionId)).toBe(0); // 두 번째는 pending 없음
  });
});

/**
 * Source invariant: context-guard.ts의 Stop 경로에 finalizeSession import/call이
 * 실제로 존재한다. (리팩터 시 사라지지 않도록 잠금.)
 */
describe('source invariant: context-guard wires finalizeSession on Stop', () => {
  it('context-guard.ts에 finalizeSession 호출 존재', () => {
    const srcPath = path.join(__dirname, '..', 'src', 'hooks', 'context-guard.ts');
    const content = fs.readFileSync(srcPath, 'utf-8');

    // import 또는 dynamic import
    expect(content).toMatch(/finalizeSession/);
    // Stop 경로 진입 후에 호출되는지 확인 (stop_hook_type 검사와 같은 파일에)
    expect(content).toMatch(/stop_hook_type/);
    // finalizeSession이 stop_hook_type 분기 이후 등장
    const stopIdx = content.indexOf('stop_hook_type');
    const finalizeIdx = content.indexOf('finalizeSession');
    expect(stopIdx).toBeGreaterThan(-1);
    expect(finalizeIdx).toBeGreaterThan(stopIdx);
  });
});
