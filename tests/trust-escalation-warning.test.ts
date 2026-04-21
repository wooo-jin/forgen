/**
 * Invariant: trust escalation (runtime > desired) surfaces a warning
 * rather than silently elevating effective trust.
 *
 * Audit finding #3 (2026-04-21): `computeEffectiveTrust` previously
 * returned `warning: null` when runtime was more permissive than the
 * user's desired policy. A `가드레일 우선` profile became `완전 신뢰 실행`
 * whenever `--dangerously-skip-permissions` was injected (fgx, config
 * default), with no user-visible signal.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const presetSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preset', 'preset-manager.ts'),
  'utf-8',
);
const harnessSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'core', 'harness.ts'),
  'utf-8',
);
const fgxSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'fgx.ts'),
  'utf-8',
);

describe('trust-escalation warning path (source invariants)', () => {
  it('computeEffectiveTrust는 runtime > desired일 때 warning을 null이 아닌 값으로 반환한다', () => {
    // 분기 범위를 line 기반으로 추출 (템플릿 리터럴 내부 `}` 때문에 regex로 단일 block 캡처가 어려움)
    const lines = presetSrc.split('\n');
    const startIdx = lines.findIndex((l) => /if\s*\(\s*runtimeRank > desiredRank\s*\)/.test(l));
    expect(startIdx).toBeGreaterThanOrEqual(0);

    // 분기의 끝은 들여쓰기 2칸짜리 `}` 또는 `}` 단독 라인 (가장 얕은 닫힘) — 간단히 다음 `return `이 나오는 줄까지만 검사
    const bodyEndRel = lines
      .slice(startIdx + 1)
      .findIndex((l) => /^\s{0,2}return\b/.test(l) && !/runtimeRank/.test(l));
    expect(bodyEndRel).toBeGreaterThan(0);
    const block = lines.slice(startIdx, startIdx + 1 + bodyEndRel).join('\n');

    // 주석 라인 제거 후 코드만 검사 (내 주석이 "warning: null"을 서술하므로)
    const codeOnly = block
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(codeOnly).toMatch(/Trust 상승/);
    expect(codeOnly).not.toMatch(/warning:\s*null/);
  });

  it('harness는 Trust 상승 warning을 사용자에게 출력한다', () => {
    expect(harnessSrc).toMatch(/Trust 상승/);
    expect(harnessSrc).toMatch(/console\.warn/);
  });

  it('fgx는 가드레일/승인 완화 프로필 사용자를 명시적으로 경고한다', () => {
    expect(fgxSrc).toMatch(/가드레일 우선|승인 완화/);
    expect(fgxSrc).toMatch(/consider.*forgen/);
  });
});

describe('trust-escalation warning runtime', () => {
  it('computeEffectiveTrust(): 실제 호출에서 escalation warning 반환', async () => {
    const { computeEffectiveTrust } = await import('../src/preset/preset-manager.js');
    const result = computeEffectiveTrust('가드레일 우선', {
      permission_mode: 'bypassed',
      dangerous_skip_permissions: true,
      auto_accept_scope: [],
      detected_from: 'test',
    });

    expect(result.effective).toBe('완전 신뢰 실행');
    expect(result.warning).not.toBeNull();
    expect(result.warning).toMatch(/Trust 상승/);
  });

  it('computeEffectiveTrust(): desired === runtime이면 warning 없음', async () => {
    const { computeEffectiveTrust } = await import('../src/preset/preset-manager.js');
    const result = computeEffectiveTrust('가드레일 우선', {
      permission_mode: 'guarded',
      dangerous_skip_permissions: false,
      auto_accept_scope: [],
      detected_from: 'test',
    });
    expect(result.warning).toBeNull();
  });
});
