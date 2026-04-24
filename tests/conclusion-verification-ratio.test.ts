/**
 * TEST-3: 결론-검증 비율 가드.
 *
 * v0.4.0 self-interview RC3: "통과 / 완료 / 동작" 같은 결론이 5~8회 쏟아지지만
 * "테스트 / 확인 / 검증" 서술은 0회. 이 비율을 텍스트-내부 신호로 잡아 stop-guard
 * 가 block 해야 재응답이 실제 측정 증거를 포함하게 된다.
 */
import { describe, it, expect } from 'vitest';
import { checkConclusionVerificationRatio } from '../src/checks/conclusion-verification-ratio.js';

describe('checkConclusionVerificationRatio — TEST-3', () => {
  it('sparse text (< minTotal) 은 판정 보류', () => {
    const r = checkConclusionVerificationRatio({
      text: '완료',
      minTotal: 4,
    });
    expect(r.block).toBe(false);
  });

  it('결론 5 vs 검증 0 → block (ratio Infinity)', () => {
    const text = '통과했습니다. 완료됐습니다. pass. done. confirmed.';
    const r = checkConclusionVerificationRatio({ text });
    expect(r.conclusionCount).toBeGreaterThanOrEqual(4);
    expect(r.verificationCount).toBe(0);
    expect(r.block).toBe(true);
    expect(r.reason).toContain('결론');
  });

  it('결론 5 vs 검증 2 → block (ratio 2.5 > threshold=2)', () => {
    const text = '통과했습니다. 완료됐습니다. done. pass. shipped. 테스트 확인.';
    const r = checkConclusionVerificationRatio({ text, threshold: 2 });
    expect(r.conclusionCount).toBeGreaterThanOrEqual(5);
    expect(r.verificationCount).toBe(2);
    expect(r.block).toBe(true);
  });

  it('결론 4 vs 검증 3 → block=false (balanced)', () => {
    const text = '통과됐습니다. 완료. done. pass. 테스트 실행하고 확인했습니다. 검증 완료.';
    const r = checkConclusionVerificationRatio({ text });
    // Note: "완료" count matches both conclusion patterns
    expect(r.ratio).toBeLessThanOrEqual(3);
  });

  it('결론 0 → never block', () => {
    const text = '테스트를 실행하고 결과를 확인 중입니다. 검증 측정 running.';
    const r = checkConclusionVerificationRatio({ text });
    expect(r.conclusionCount).toBe(0);
    expect(r.block).toBe(false);
  });

  it('threshold 3 보다 ratio 2 는 block 안 함', () => {
    const text = '통과. 완료. 테스트 실행하고 확인했다. verified 검증.';
    const r = checkConclusionVerificationRatio({ text, threshold: 3 });
    expect(r.ratio).toBeLessThanOrEqual(3);
    expect(r.block).toBe(false);
  });

  it('block reason 에 결론/검증 카운트 포함', () => {
    const text = 'pass. done. shipped. finished. complete.';
    const r = checkConclusionVerificationRatio({ text });
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/(결론 \d+건 vs 검증 0건|결론\/검증 비율)/);
  });

  it('영문/한글 혼합 모두 카운트', () => {
    const text = '모두 통과. All tests passed. 완료됐다. done and shipped.';
    const r = checkConclusionVerificationRatio({ text });
    expect(r.conclusionCount).toBeGreaterThan(3);
  });
});
