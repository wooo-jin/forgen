import { describe, it, expect } from 'vitest';
import { computeOverallScore } from '../../src/engine/meta-learning/session-quality-scorer.js';

describe('Session Quality Scorer', () => {
  describe('computeOverallScore', () => {
    it('returns 100 for perfect session (no corrections, no drift, no reverts, effective solutions)', () => {
      const score = computeOverallScore(0, 0, 0, 1.0);
      expect(score).toBe(100);
    });

    it('returns clamped 0 for catastrophic session', () => {
      const score = computeOverallScore(10, 100, 20, 0);
      expect(score).toBe(0);
    });

    it('penalizes corrections proportionally', () => {
      const noCorrections = computeOverallScore(0, 0, 0, 0);
      const someCorrections = computeOverallScore(0.5, 0, 0, 0);
      expect(someCorrections).toBeLessThan(noCorrections);
      expect(noCorrections - someCorrections).toBeCloseTo(0.5 * 15, 1);
    });

    it('penalizes drift score proportionally', () => {
      const noDrift = computeOverallScore(0, 0, 0, 0);
      const highDrift = computeOverallScore(0, 50, 0, 0);
      expect(highDrift).toBeLessThan(noDrift);
      expect(noDrift - highDrift).toBeCloseTo(50 * 0.3, 1);
    });

    it('penalizes reverts at 5 points each', () => {
      const noReverts = computeOverallScore(0, 0, 0, 0);
      const twoReverts = computeOverallScore(0, 0, 2, 0);
      expect(noReverts - twoReverts).toBeCloseTo(10, 1);
    });

    it('rewards solution effectiveness up to 20 points', () => {
      // Use a baseline with some penalty so the boost is visible before clamping
      const noSolutions = computeOverallScore(1, 30, 1, 0);
      const effectiveSolutions = computeOverallScore(1, 30, 1, 1.0);
      expect(effectiveSolutions - noSolutions).toBeCloseTo(20, 1);
    });

    it('clamps score between 0 and 100', () => {
      expect(computeOverallScore(0, 0, 0, 10)).toBe(100);  // would be > 100
      expect(computeOverallScore(100, 100, 100, 0)).toBe(0); // would be < 0
    });
  });
});
