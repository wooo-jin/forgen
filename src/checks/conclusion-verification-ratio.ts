/**
 * Forgen v0.4.1 — TEST-3: 결론 vs 검증 비율 가드
 *
 * Claude 응답 텍스트에서 **결론 키워드** 와 **검증 키워드** 빈도 비율을 측정.
 * 결론 / 검증 > 3 이면 "결론을 쏟아내지만 검증이 부족한" 합의-기반 완료 선언
 * 패턴 — stop-guard 에서 block.
 *
 * 배경 (RC3): v0.4.0 self-interview 에서 "통과했다 / 완료됐다" 같은 결론이
 *   한 응답에 5~8회 반복되지만 "테스트 실행했나 / 증거가 뭔가" 관련 표현은
 *   0회인 케이스 반복 관찰. TEST-1 이 "측정 도구 호출 0건" 을 봤다면, TEST-3
 *   은 같은 문제를 **텍스트-내부** 비율로 잡는다 (도구 호출이 있어도 서술이
 *   결론-편향이면 감지).
 *
 * 순수 함수 — Stop hook 이 `block_message` 로 주입할 수 있도록 reason 문자열을
 * 직접 반환.
 */

/** 결론 키워드 — 상태를 단정적으로 선언하는 어휘. */
const CONCLUSION_PATTERNS: RegExp[] = [
  /\b(pass(es|ed)?|passing)\b/gi,
  /\b(done|ready|shipped|finished|complete)\b/gi,
  /\bLGTM\b/g,
  /\bconfirmed\b/gi,
  /\bverified\b/gi,
  /\bvalidated\b/gi,
  /(통과(했|됐|함|합니다))/g,
  /(완료(했|됐|됨|됐습니다))/g,
  /(성공(했|했습니다|적))/g,
  /(동작(합니다|함|한다))/g,
];

/** 검증 키워드 — 측정/확인/실행 행위를 서술하는 어휘. */
const VERIFICATION_PATTERNS: RegExp[] = [
  /\b(test(s|ed|ing)?|tested)\b/gi,
  /\b(verify|verifying|verification)\b/gi,
  /\b(check(ed|ing)?)\b/gi,
  /\b(run|ran|running)\b/gi,
  /\b(measure(d|ment)?)\b/gi,
  /\bevidence\b/gi,
  /증거/g,
  /테스트/g,
  /확인/g,
  /검증/g,
  /실행/g,
  /측정/g,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) n += m.length;
  }
  return n;
}

export interface RatioCheckInput {
  text: string;
  /** 비율 임계값. 기본 3 (결론이 검증의 3배 넘으면 block). */
  threshold?: number;
  /**
   * 결론/검증 둘 다 합쳐 이 개수 미만이면 판정 보류 (sparse text).
   * 기본 4 — 짧은 1-2줄 응답에 오탐 방지.
   */
  minTotal?: number;
}

export interface RatioCheckResult {
  /** true = 결론 편향 감지 — block 후보. */
  block: boolean;
  conclusionCount: number;
  verificationCount: number;
  /** 검증이 0이면 Infinity, 아니면 결론/검증. */
  ratio: number;
  /** block 시 stop-guard block_message 로 주입할 사람-읽기 문장. */
  reason: string;
}

export function checkConclusionVerificationRatio(input: RatioCheckInput): RatioCheckResult {
  const threshold = input.threshold ?? 3;
  const minTotal = input.minTotal ?? 4;

  const conclusionCount = countMatches(input.text, CONCLUSION_PATTERNS);
  const verificationCount = countMatches(input.text, VERIFICATION_PATTERNS);
  const total = conclusionCount + verificationCount;

  const ratio = verificationCount === 0
    ? (conclusionCount === 0 ? 0 : Infinity)
    : conclusionCount / verificationCount;

  // sparse text → 판정 보류
  if (total < minTotal) {
    return {
      block: false,
      conclusionCount,
      verificationCount,
      ratio,
      reason: '',
    };
  }

  // 결론이 전혀 없으면 비율 자체가 의미 없음
  if (conclusionCount === 0) {
    return { block: false, conclusionCount, verificationCount, ratio, reason: '' };
  }

  const block = ratio > threshold;

  let reason = '';
  if (block) {
    reason =
      verificationCount === 0
        ? `결론 ${conclusionCount}건 vs 검증 0건. 완료 선언 전에 실제 실행/측정 증거 (npm test, curl, Read 결과 등) 를 턴에 포함시켜 재응답.`
        : `결론/검증 비율 ${ratio.toFixed(1)} (${conclusionCount}/${verificationCount}) > ${threshold}. 결론에 비해 검증 서술이 적음 — 증거(실행 결과/측정값) 를 추가하여 재응답.`;
  }

  return { block, conclusionCount, verificationCount, ratio, reason };
}
