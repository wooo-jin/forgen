import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME, TEST_CWD } = vi.hoisted(() => {
  const home = `/tmp/forgen-test-guardrail-${process.pid}`;
  return {
    TEST_HOME: home,
    TEST_CWD: `${home}/proj`,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

// isHookEnabled는 각 테스트에서 module 캐시 초기화 후 재import (config 캐시 때문)
const { getProtectedHookNames } = await import('../src/hooks/hook-config.js');
const { HOOK_REGISTRY } = await import('../src/hooks/hook-registry.js');
const { FORGEN_HOME } = await import('../src/core/paths.js');

function writeGlobalConfig(obj: unknown): void {
  fs.mkdirSync(FORGEN_HOME, { recursive: true });
  fs.writeFileSync(path.join(FORGEN_HOME, 'hook-config.json'), JSON.stringify(obj));
}

function writeProjectConfig(obj: unknown): void {
  fs.mkdirSync(path.join(TEST_CWD, '.forgen'), { recursive: true });
  fs.writeFileSync(path.join(TEST_CWD, '.forgen', 'hook-config.json'), JSON.stringify(obj));
}

function setCwd(): void {
  fs.mkdirSync(TEST_CWD, { recursive: true });
  process.env.FORGEN_CWD = TEST_CWD;
}

function clearConfigCache(): void {
  // config는 프로세스 내 1회 캐시됨. 각 테스트마다 module 재import로 초기화.
  vi.resetModules();
}

/**
 * Invariant: compound-core tier 및 compoundCritical=true 훅은 어떤 project/
 * global config 경로로도 비활성화되지 않는다. 복리화 3축을 project config 실수로
 * 끄는 것을 방지하는 가드레일.
 */
describe('compound-core guardrail invariant: protected hooks cannot be disabled', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    setCwd();
    clearConfigCache();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env.FORGEN_CWD;
  });

  it('getProtectedHookNames는 registry의 compound-core + compoundCritical 합집합을 반환', () => {
    const expected = HOOK_REGISTRY
      .filter(h => h.tier === 'compound-core' || h.compoundCritical === true)
      .map(h => h.name)
      .sort();
    expect(getProtectedHookNames()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0); // sanity
  });

  it('project config hooks.post-tool-use.enabled=false → 무시하고 true 반환 (compound-core)', async () => {
    writeProjectConfig({ hooks: { 'post-tool-use': { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('post-tool-use')).toBe(true);
  });

  it('project config hooks.solution-injector.enabled=false → 무시 (compoundCritical)', async () => {
    writeProjectConfig({ hooks: { 'solution-injector': { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('solution-injector')).toBe(true);
  });

  it('project config tiers.compound-core.enabled=false → 무시', async () => {
    writeProjectConfig({ tiers: { 'compound-core': { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('session-recovery')).toBe(true);
    expect(fn('pre-tool-use')).toBe(true);
  });

  it('global config hooks.skill-injector.enabled=false → 무시', async () => {
    writeGlobalConfig({ hooks: { 'skill-injector': { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('skill-injector')).toBe(true);
  });

  it('레거시 최상위 post-tool-use.enabled=false → 무시', async () => {
    writeProjectConfig({ 'post-tool-use': { enabled: false } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('post-tool-use')).toBe(true);
  });

  it('모든 PROTECTED_HOOKS를 동시에 끄려 시도해도 전부 true', async () => {
    const protectedNames = getProtectedHookNames();
    const hooks: Record<string, { enabled: boolean }> = {};
    for (const name of protectedNames) hooks[name] = { enabled: false };
    writeProjectConfig({ hooks });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    for (const name of protectedNames) {
      expect(fn(name), `${name}이 config에도 불구하고 보호되지 않음`).toBe(true);
    }
  });
});

/**
 * 보호되지 않은 훅(safety/workflow의 compoundCritical=false)은 기존 config
 * 의미대로 정상 비활성화 가능.
 */
describe('non-protected hooks respect config as before', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    setCwd();
    clearConfigCache();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env.FORGEN_CWD;
  });

  it('safety tier hook은 개별 disable 가능', async () => {
    // secret-filter는 safety tier, compoundCritical=false
    writeProjectConfig({ hooks: { 'secret-filter': { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('secret-filter')).toBe(false);
  });

  it('workflow tier hook은 tier-level disable 가능', async () => {
    writeProjectConfig({ tiers: { workflow: { enabled: false } } });
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    // keyword-detector는 workflow tier, compoundCritical=false
    expect(fn('keyword-detector')).toBe(false);
  });

  it('config 없으면 기본값 true', async () => {
    const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
    expect(fn('secret-filter')).toBe(true);
    expect(fn('post-tool-use')).toBe(true);
  });
});
