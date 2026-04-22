/**
 * S1 regression — safe-regex 는 ReDoS 노출이 큰 패턴을 거부한다.
 */
import { describe, it, expect } from 'vitest';
import { compileSafeRegex, safeRegexTest } from '../src/hooks/shared/safe-regex.js';

describe('compileSafeRegex', () => {
  it('정상 패턴 → compile 성공', () => {
    const r = compileSafeRegex('rm\\s+-rf');
    expect(r.regex).not.toBeNull();
    expect(r.reason).toBeNull();
  });

  it('빈 문자열 → 거부', () => {
    expect(compileSafeRegex('').regex).toBeNull();
  });

  it('500자 초과 → 거부', () => {
    expect(compileSafeRegex('a'.repeat(600)).regex).toBeNull();
  });

  it('중첩 quantifier (catastrophic) → 거부', () => {
    expect(compileSafeRegex('(a+)+').regex).toBeNull();
    expect(compileSafeRegex('(a*)*').regex).toBeNull();
    expect(compileSafeRegex('(a|b+)+').regex).toBeNull();
  });

  it('backreference → 거부', () => {
    expect(compileSafeRegex('(a)\\1+').regex).toBeNull();
  });

  it('유효한 alternation → 허용', () => {
    const r = compileSafeRegex('(sk-ant|AIza|ghp_)');
    expect(r.regex).not.toBeNull();
  });

  it('문법 오류 패턴 → 거부 (reason 에 compile error)', () => {
    const r = compileSafeRegex('[unclosed');
    expect(r.regex).toBeNull();
    expect(r.reason).toMatch(/compile error/);
  });
});

describe('safeRegexTest', () => {
  it('정상 길이 입력 → regex.test 와 동일', () => {
    const r = compileSafeRegex('foo').regex!;
    expect(safeRegexTest(r, 'some foo bar')).toBe(true);
    expect(safeRegexTest(r, 'no match here')).toBe(false);
  });

  it('65536+ 문자 입력 → truncate', () => {
    const r = compileSafeRegex('needle').regex!;
    // needle 을 65537 위치에 두고 truncate 에 걸려 못 찾게 함
    const big = 'x'.repeat(100000) + 'needle';
    expect(safeRegexTest(r, big)).toBe(false);
    // 앞부분에 있으면 찾음
    const front = 'needle' + 'x'.repeat(100000);
    expect(safeRegexTest(r, front)).toBe(true);
  });
});
