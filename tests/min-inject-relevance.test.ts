/**
 * Invariant: solution-injector applies a minimum relevance gate before
 * injecting a candidate, and the gate value matches the error-attribution
 * gate so inject/attribute semantics stay aligned.
 *
 * Background (2026-04-21 data audit): two solutions matched at relevance
 * 0.15 / 0.21 were injected into nearly every session, producing 80% of
 * all error outcomes via the attribution window. This locks in the fix.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MIN_INJECT_RELEVANCE } from '../src/hooks/solution-injector.js';

describe('MIN_INJECT_RELEVANCE gate', () => {
  it('상수는 0.3으로 공개된다 (error 귀속 게이트와 동일)', () => {
    expect(MIN_INJECT_RELEVANCE).toBe(0.3);
  });

  it('solution-injector.ts는 매칭 루프에서 MIN_INJECT_RELEVANCE로 필터한다', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'hooks', 'solution-injector.ts'),
      'utf-8',
    );
    // 필터 라인이 실제로 존재하는지
    expect(src).toMatch(/if\s*\(\s*sol\.relevance\s*<\s*MIN_INJECT_RELEVANCE\s*\)\s*continue/);
  });

  it('solution-outcomes.ts의 MIN_ERROR_MATCH_SCORE와 정렬되어 있다', () => {
    const outcomesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'engine', 'solution-outcomes.ts'),
      'utf-8',
    );
    const match = outcomesSrc.match(/const\s+MIN_ERROR_MATCH_SCORE\s*=\s*([\d.]+)/);
    expect(match).not.toBeNull();
    const errorGate = parseFloat(match![1]);
    // inject ≤ attribute — 주입한 건 최소한 error로 귀속될 수 있어야 한다.
    expect(MIN_INJECT_RELEVANCE).toBeLessThanOrEqual(errorGate);
  });
});
