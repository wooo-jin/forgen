import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_MATCHER_WEIGHTS } from '../../src/engine/meta-learning/types.js';

describe('Matcher Weight Tuner — types and guardrails', () => {
  it('default weights sum to 1.0', () => {
    const sum = DEFAULT_MATCHER_WEIGHTS.tfidf + DEFAULT_MATCHER_WEIGHTS.bm25 + DEFAULT_MATCHER_WEIGHTS.bigram;
    expect(sum).toBeCloseTo(1.0);
  });

  it('default weights are within guardrail bounds', () => {
    const { weightFloor, weightCeiling } = DEFAULT_CONFIG.guardrails;
    expect(DEFAULT_MATCHER_WEIGHTS.tfidf).toBeGreaterThanOrEqual(weightFloor);
    expect(DEFAULT_MATCHER_WEIGHTS.tfidf).toBeLessThanOrEqual(weightCeiling);
    expect(DEFAULT_MATCHER_WEIGHTS.bm25).toBeGreaterThanOrEqual(weightFloor);
    expect(DEFAULT_MATCHER_WEIGHTS.bm25).toBeLessThanOrEqual(weightCeiling);
    expect(DEFAULT_MATCHER_WEIGHTS.bigram).toBeGreaterThanOrEqual(weightFloor);
    expect(DEFAULT_MATCHER_WEIGHTS.bigram).toBeLessThanOrEqual(weightCeiling);
  });

  it('guardrail floor < ceiling', () => {
    expect(DEFAULT_CONFIG.guardrails.weightFloor).toBeLessThan(DEFAULT_CONFIG.guardrails.weightCeiling);
  });

  it('max weight delta is positive and reasonable', () => {
    expect(DEFAULT_CONFIG.guardrails.maxWeightDelta).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.guardrails.maxWeightDelta).toBeLessThanOrEqual(0.1);
  });
});
