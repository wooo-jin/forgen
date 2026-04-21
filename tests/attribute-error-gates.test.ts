/**
 * Invariant: attributeError applies match_score / recency / top-K gates.
 *
 * Background (2026-04-21 data audit): without gates, a single tool failure
 * blanket-attributed `error` to every pending solution regardless of
 * relevance, and 80% of all error outcomes concentrated on 3 solutions
 * that happened to get injected at low match_score (0.15-0.21) in nearly
 * every session. This distorted fitness and fed bad signal to the Phase 4
 * evolver.
 *
 * These tests lock in the three gates so the regression cannot recur.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-attr-error-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { appendPending, attributeError } = await import('../src/engine/solution-outcomes.js');
const { STATE_DIR, OUTCOMES_DIR } = await import('../src/core/paths.js');

function readOutcomes(sessionId: string): Array<Record<string, unknown>> {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const p = path.join(OUTCOMES_DIR, `${sanitized}.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

describe('attributeError gates', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('솔루션 match_score < 0.3은 error 귀속에서 제외한다', () => {
    const sid = 'sess-lowscore';
    appendPending(sid, [
      { solution: 'low-a', match_score: 0.15, injected_chars: 100 },
      { solution: 'low-b', match_score: 0.29, injected_chars: 100 },
      { solution: 'hi-c', match_score: 0.5, injected_chars: 100 },
    ]);
    const attributed = attributeError(sid);
    expect(attributed).toEqual(['hi-c']);

    const events = readOutcomes(sid).filter((e) => e.outcome === 'error');
    expect(events.map((e) => e.solution)).toEqual(['hi-c']);
  });

  it('주입 후 5분 이상 지난 pending에는 error 귀속하지 않는다', () => {
    const sid = 'sess-stale';
    appendPending(sid, [
      { solution: 'recent', match_score: 0.8, injected_chars: 100 },
    ]);

    // manual rewrite of pending file to simulate stale injection (6분 전)
    const p = path.join(STATE_DIR, `outcome-pending-${sid}.json`);
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
      pending: Array<{ ts: number }>;
    };
    raw.pending[0].ts = Date.now() - 6 * 60 * 1000;
    fs.writeFileSync(p, JSON.stringify(raw));

    const attributed = attributeError(sid);
    expect(attributed).toEqual([]);
  });

  it('한 번의 error 이벤트는 최대 3개의 솔루션에만 귀속된다', () => {
    const sid = 'sess-topk';
    appendPending(sid, [
      { solution: 's1', match_score: 0.9, injected_chars: 100 },
      { solution: 's2', match_score: 0.85, injected_chars: 100 },
      { solution: 's3', match_score: 0.8, injected_chars: 100 },
      { solution: 's4', match_score: 0.75, injected_chars: 100 },
      { solution: 's5', match_score: 0.7, injected_chars: 100 },
    ]);

    const attributed = attributeError(sid);
    expect(attributed).toHaveLength(3);
    // 가장 relevant한 상위 3개만 귀속
    expect(new Set(attributed)).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('동일 세션에서 재호출 시 이미 flagged된 솔루션은 중복 귀속되지 않는다', () => {
    const sid = 'sess-dedup';
    appendPending(sid, [
      { solution: 'a', match_score: 0.9, injected_chars: 100 },
      { solution: 'b', match_score: 0.5, injected_chars: 100 },
    ]);

    const first = attributeError(sid);
    const second = attributeError(sid);
    expect(first.length + second.length).toBe(2);
    expect(new Set([...first, ...second])).toEqual(new Set(['a', 'b']));

    // 세 번째 호출은 추가 flag 없음
    expect(attributeError(sid)).toEqual([]);
  });

  it('pending 전부가 게이트 미달이면 빈 배열 반환 (no-op)', () => {
    const sid = 'sess-empty-gate';
    appendPending(sid, [
      { solution: 'weak-1', match_score: 0.1, injected_chars: 50 },
      { solution: 'weak-2', match_score: 0.2, injected_chars: 50 },
    ]);
    expect(attributeError(sid)).toEqual([]);
    expect(readOutcomes(sid)).toHaveLength(0);
  });
});
