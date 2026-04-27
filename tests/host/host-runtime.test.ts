/**
 * HostRuntime — Multi-Host Core Design Phase 2 단위 테스트
 *
 * 6 곳의 `runtime === 'codex'` 분기를 host-runtime 어댑터로 흡수한 결과 검증.
 */

import { describe, expect, it } from 'vitest';
import { getHostRuntime } from '../../src/host/host-runtime.js';

describe('getHostRuntime', () => {
  it('claude / codex 모두 등록', () => {
    expect(getHostRuntime('claude').id).toBe('claude');
    expect(getHostRuntime('codex').id).toBe('codex');
  });

  it('미등록 host throw', () => {
    expect(() => getHostRuntime('gemini' as never)).toThrow(/Unknown runtime host/);
  });

  it('displayName: Claude / Codex (UI 라벨)', () => {
    expect(getHostRuntime('claude').displayName).toBe('Claude');
    expect(getHostRuntime('codex').displayName).toBe('Codex');
  });

  it('launcher binary 이름', () => {
    expect(getHostRuntime('claude').launcher).toBe('claude');
    expect(getHostRuntime('codex').launcher).toBe('codex');
  });

  it('missingInstallMessage 가 host 별', () => {
    expect(getHostRuntime('claude').missingInstallMessage).toMatch(/Claude Code is not installed/);
    expect(getHostRuntime('codex').missingInstallMessage).toMatch(/Codex is not installed/);
  });

  it('hookInjectionStrategy: Claude=pre-baked-file, Codex=generate', () => {
    expect(getHostRuntime('claude').hookInjectionStrategy).toBe('pre-baked-file');
    expect(getHostRuntime('codex').hookInjectionStrategy).toBe('generate');
  });
});

describe('wrapHookCommand — Claude (raw node call)', () => {
  const claude = getHostRuntime('claude');

  it('인자 없이', () => {
    const cmd = claude.wrapHookCommand('/abs/forgen/dist', 'hooks/foo.js', '');
    expect(cmd).toBe('node "/abs/forgen/dist/hooks/foo.js"');
    expect(cmd).not.toContain('codex-adapter');
  });

  it('인자 포함', () => {
    const cmd = claude.wrapHookCommand('/abs/forgen/dist', 'hooks/foo.js', '"--flag" "value"');
    expect(cmd).toBe('node "/abs/forgen/dist/hooks/foo.js" "--flag" "value"');
  });
});

describe('wrapHookCommand — Codex (codex-adapter 경유)', () => {
  const codex = getHostRuntime('codex');

  it('codex-adapter 가 항상 wrapper 로 들어가고 절대경로', () => {
    const cmd = codex.wrapHookCommand('/abs/forgen/dist', 'hooks/foo.js', '');
    expect(cmd).toContain('codex-adapter.js');
    expect(cmd).toBe('node "/abs/forgen/dist/host/codex-adapter.js" "/abs/forgen/dist/hooks/foo.js"');
  });

  it('인자 포함 시 adapter 다음에 그대로 전달', () => {
    const cmd = codex.wrapHookCommand('/abs/forgen/dist', 'hooks/foo.js', '"--x"');
    expect(cmd).toBe('node "/abs/forgen/dist/host/codex-adapter.js" "/abs/forgen/dist/hooks/foo.js" "--x"');
  });
});
