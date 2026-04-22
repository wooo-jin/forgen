/**
 * Safe regex compiler — ReDoS 방지용 경량 가드.
 *
 * rule JSON 의 verifier.params.pattern 등 user-controlled regex 를 hook 런타임에
 * 그대로 new RegExp() 하면 catastrophic backtracking 으로 hook hang 위험이 있다.
 * re2 같은 linear-time 엔진 의존은 native binding 을 추가시키므로, 여기서는
 * **패턴 복잡도 제한** + **입력 크기 제한** 으로 1차 방어.
 *
 * 정책:
 *   - 패턴 길이 ≤ 500자.
 *   - 중첩 quantifier (`(...)+)+` / `(...)*)*` / `(.+)+`) 같은 catastrophic 신호 거부.
 *   - backreference `\1..\9` 금지.
 *   - compile 실패 또는 거부 시 null 반환 → 호출자가 skip.
 */

const MAX_PATTERN_LEN = 500;
const MAX_INPUT_LEN = 65536;

// Catastrophic backtracking 의 흔한 형태 — 중첩된 quantifier 체인.
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*]/;
// Alternation with shared prefix can also be catastrophic — heuristic only.
const OVERLAPPING_ALT = /\(([^|)]+)\|\1[^)]*\)[+*]/;
const BACKREFERENCE = /\\[1-9]/;

export interface SafeRegexResult {
  regex: RegExp | null;
  reason: string | null;
}

/**
 * 패턴을 안전하게 컴파일. 거부되거나 실패 시 { regex: null, reason } 반환.
 * 호출자는 reason 을 log.debug 로 기록하고 skip 하는 것이 권장 사용법.
 */
export function compileSafeRegex(pattern: string, flags = ''): SafeRegexResult {
  if (typeof pattern !== 'string') return { regex: null, reason: 'non-string pattern' };
  if (pattern.length === 0) return { regex: null, reason: 'empty pattern' };
  if (pattern.length > MAX_PATTERN_LEN) return { regex: null, reason: `pattern length ${pattern.length} > ${MAX_PATTERN_LEN}` };
  if (NESTED_QUANTIFIER.test(pattern)) return { regex: null, reason: 'nested quantifier (catastrophic backtracking risk)' };
  if (OVERLAPPING_ALT.test(pattern)) return { regex: null, reason: 'overlapping alternation with quantifier' };
  if (BACKREFERENCE.test(pattern)) return { regex: null, reason: 'backreference in user regex (perf risk)' };

  try {
    return { regex: new RegExp(pattern, flags), reason: null };
  } catch (e) {
    return { regex: null, reason: `compile error: ${String(e).slice(0, 80)}` };
  }
}

/** 입력을 MAX_INPUT_LEN 으로 자른 뒤 regex.test() 수행. 입력 DoS 방어. */
export function safeRegexTest(regex: RegExp, input: string): boolean {
  const truncated = input.length > MAX_INPUT_LEN ? input.slice(0, MAX_INPUT_LEN) : input;
  return regex.test(truncated);
}
