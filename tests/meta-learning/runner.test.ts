import { describe, it, expect, vi } from 'vitest';

const TEST_HOME = '/tmp/forgen-test-meta-learning';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('../../src/core/paths.js', () => {
  const p = require('node:path');
  const BASE = '/tmp/forgen-test-meta-learning';
  const FORGEN_HOME = p.join(BASE, '.forgen');
  const ME_DIR = p.join(FORGEN_HOME, 'me');
  return {
    COMPOUND_HOME: p.join(BASE, '.compound'),
    FORGEN_HOME,
    ME_DIR,
    ME_SOLUTIONS: p.join(ME_DIR, 'solutions'),
    ME_RULES: p.join(ME_DIR, 'rules'),
    ME_BEHAVIOR: p.join(ME_DIR, 'behavior'),
    ME_PHILOSOPHY: p.join(ME_DIR, 'philosophy.json'),
    PACKS_DIR: p.join(FORGEN_HOME, 'packs'),
    STATE_DIR: p.join(FORGEN_HOME, 'state'),
    SESSIONS_DIR: p.join(FORGEN_HOME, 'sessions'),
    SESSION_QUALITY_DIR: p.join(FORGEN_HOME, 'state', 'session-quality'),
    META_LEARNING_DIR: p.join(FORGEN_HOME, 'state', 'meta-learning'),
    GLOBAL_CONFIG: p.join(FORGEN_HOME, 'config.json'),
    LAB_DIR: p.join(FORGEN_HOME, 'lab'),
    LAB_EVENTS: p.join(FORGEN_HOME, 'lab', 'events.jsonl'),
    FORGE_PROFILE: p.join(ME_DIR, 'forge-profile.json'),
    MATCH_EVAL_LOG_PATH: p.join(FORGEN_HOME, 'state', 'match-eval-log.jsonl'),
    ALL_MODES: ['ralph'],
    projectDir: (cwd: string) => p.join(cwd, '.compound'),
    packLinkPath: (cwd: string) => p.join(cwd, '.compound', 'pack.link'),
    projectPhilosophyPath: (cwd: string) => p.join(cwd, '.compound', 'philosophy.json'),
    projectForgeProfilePath: (cwd: string) => p.join(cwd, '.compound', 'forge-profile.json'),
  };
});

import { runMetaLearning, loadMetaLearningConfig } from '../../src/engine/meta-learning/runner.js';
import { DEFAULT_CONFIG } from '../../src/engine/meta-learning/types.js';

describe('Meta-Learning Runner', () => {
  it('returns skipped when meta-learning is disabled (default)', () => {
    const result = runMetaLearning('test-session', '/tmp/test-cwd');
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('disabled');
  });

  it('loads default config when no hook-config.json exists', () => {
    const config = loadMetaLearningConfig();
    expect(config.enabled).toBe(false);
    expect(config.features.sessionQualityScorer).toBe(true);
    expect(config.guardrails.weightFloor).toBe(0.1);
  });

  it('default config has all required fields', () => {
    expect(DEFAULT_CONFIG.features).toHaveProperty('sessionQualityScorer');
    expect(DEFAULT_CONFIG.features).toHaveProperty('matcherWeightTuning');
    expect(DEFAULT_CONFIG.features).toHaveProperty('scopeAutoPromotion');
    expect(DEFAULT_CONFIG.features).toHaveProperty('adaptiveThresholds');
    expect(DEFAULT_CONFIG.features).toHaveProperty('extractionTuning');
    expect(DEFAULT_CONFIG.coldStart).toHaveProperty('minSessionsForQuality');
    expect(DEFAULT_CONFIG.guardrails).toHaveProperty('weightFloor');
    expect(DEFAULT_CONFIG.guardrails).toHaveProperty('degradationThreshold');
  });
});
