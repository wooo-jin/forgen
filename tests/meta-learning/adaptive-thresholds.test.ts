import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_PROMOTION_THRESHOLDS } from '../../src/engine/meta-learning/types.js';

describe('Adaptive Thresholds — types and defaults', () => {
  it('default experiment thresholds are reasonable', () => {
    const t = DEFAULT_PROMOTION_THRESHOLDS.experiment;
    expect(t.reflected).toBeGreaterThanOrEqual(2);
    expect(t.sessions).toBeGreaterThanOrEqual(2);
    expect(t.reExtracted).toBeGreaterThanOrEqual(1);
  });

  it('default thresholds are within guardrail bounds', () => {
    const { thresholdFloor, thresholdCeiling } = DEFAULT_CONFIG.guardrails;
    const allThresholds = [
      DEFAULT_PROMOTION_THRESHOLDS.experiment.reflected,
      DEFAULT_PROMOTION_THRESHOLDS.experiment.sessions,
      DEFAULT_PROMOTION_THRESHOLDS.candidate.reflected,
      DEFAULT_PROMOTION_THRESHOLDS.candidate.sessions,
      DEFAULT_PROMOTION_THRESHOLDS.verified.reflected,
      DEFAULT_PROMOTION_THRESHOLDS.verified.sessions,
    ];
    for (const t of allThresholds) {
      expect(t).toBeGreaterThanOrEqual(thresholdFloor);
      expect(t).toBeLessThanOrEqual(thresholdCeiling);
    }
  });

  it('thresholds increase with promotion stage', () => {
    const e = DEFAULT_PROMOTION_THRESHOLDS.experiment;
    const c = DEFAULT_PROMOTION_THRESHOLDS.candidate;
    const v = DEFAULT_PROMOTION_THRESHOLDS.verified;
    expect(c.reflected).toBeGreaterThanOrEqual(e.reflected);
    expect(v.reflected).toBeGreaterThan(c.reflected);
  });

  it('cold-start thresholds are positive', () => {
    expect(DEFAULT_CONFIG.coldStart.minSolutionsForThresholds).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.coldStart.minSolutionsForMatcher).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.coldStart.minSolutionsForExtraction).toBeGreaterThan(0);
  });
});
