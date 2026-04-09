import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  COMPOUND_HOME,
  FORGEN_HOME,
  ME_DIR,
  ME_PHILOSOPHY,
  ME_SOLUTIONS,
  ME_BEHAVIOR,
  ME_RULES,
  PACKS_DIR,
  STATE_DIR,
  SESSIONS_DIR,
  GLOBAL_CONFIG,
  ALL_MODES,
  projectDir,
  packLinkPath,
} from '../src/core/paths.js';

const HOME = os.homedir();

describe('paths', () => {
  it('COMPOUND_HOME은 ~/.compound/ (레거시 호환)', () => {
    expect(COMPOUND_HOME).toBe(path.join(HOME, '.compound'));
  });

  it('FORGEN_HOME은 ~/.forgen/', () => {
    expect(FORGEN_HOME).toBe(path.join(HOME, '.forgen'));
  });

  it('ME_DIR은 ~/.forgen/me/', () => {
    expect(ME_DIR).toBe(path.join(HOME, '.forgen', 'me'));
  });

  it('ME_PHILOSOPHY은 ~/.forgen/me/philosophy.json', () => {
    expect(ME_PHILOSOPHY).toContain('philosophy.json');
    expect(ME_PHILOSOPHY).toContain('.forgen');
  });

  it('ME_SOLUTIONS은 ~/.forgen/me/solutions/', () => {
    expect(ME_SOLUTIONS).toContain('solutions');
    expect(ME_SOLUTIONS).toContain('.forgen');
  });

  it('ME_BEHAVIOR은 ~/.forgen/me/behavior/', () => {
    expect(ME_BEHAVIOR).toContain('behavior');
    expect(ME_BEHAVIOR).toContain('.forgen');
  });

  it('ME_RULES은 ~/.forgen/me/rules/', () => {
    expect(ME_RULES).toContain('rules');
    expect(ME_RULES).toContain('.forgen');
  });

  it('PACKS_DIR은 ~/.forgen/packs/', () => {
    expect(PACKS_DIR).toBe(path.join(HOME, '.forgen', 'packs'));
  });

  it('STATE_DIR은 ~/.forgen/state/', () => {
    expect(STATE_DIR).toBe(path.join(HOME, '.forgen', 'state'));
  });

  it('SESSIONS_DIR은 ~/.forgen/sessions/', () => {
    expect(SESSIONS_DIR).toBe(path.join(HOME, '.forgen', 'sessions'));
  });

  it('GLOBAL_CONFIG은 ~/.forgen/config.json', () => {
    expect(GLOBAL_CONFIG).toContain('config.json');
    expect(GLOBAL_CONFIG).toContain('.forgen');
  });

  it('ALL_MODES는 9개 모드를 포함', () => {
    expect(ALL_MODES.length).toBe(9);
    expect(ALL_MODES).toContain('ralph');
    expect(ALL_MODES).toContain('autopilot');
    expect(ALL_MODES).toContain('ultrawork');
    expect(ALL_MODES).toContain('ecomode');
  });

  it('projectDir는 cwd/.compound/ 반환', () => {
    expect(projectDir('/tmp/myproject')).toBe('/tmp/myproject/.compound');
  });

  it('packLinkPath는 cwd/.compound/pack.link 반환', () => {
    expect(packLinkPath('/tmp/myproject')).toBe('/tmp/myproject/.compound/pack.link');
  });

  it('모든 경로가 절대 경로', () => {
    const paths = [COMPOUND_HOME, FORGEN_HOME, ME_DIR, ME_PHILOSOPHY, ME_SOLUTIONS, ME_BEHAVIOR, ME_RULES, PACKS_DIR, STATE_DIR, SESSIONS_DIR, GLOBAL_CONFIG];
    for (const p of paths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });
});
