/**
 * Forgen Meta-Learning — Adaptive Thresholds (Feature 4)
 *
 * Computes learning velocity and adapts promotion thresholds
 * based on the user's solution accumulation rate.
 *
 * Learning velocity = solutions created in last 30 days / 4.3 weeks
 *
 *   > 3/week (high volume)  → thresholds +1 (more evidence needed)
 *   0.5~3/week (normal)     → no change
 *   < 0.5/week (slow pace)  → thresholds -1 (lower the bar)
 *
 * Guardrails: [thresholdFloor, thresholdCeiling], max ±1 per cycle.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, META_LEARNING_DIR } from '../../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../../hooks/shared/atomic-write.js';
import type { SolutionFrontmatter } from '../solution-format.js';
import { parseFrontmatterOnly } from '../solution-format.js';
import type { AdaptiveLifecycleThresholds, MetaLearningConfig } from './types.js';
import { DEFAULT_PROMOTION_THRESHOLDS } from './types.js';

const THRESHOLDS_PATH = path.join(META_LEARNING_DIR, 'lifecycle-thresholds.json');
const VELOCITY_WINDOW_DAYS = 30;
const WEEKS_IN_WINDOW = VELOCITY_WINDOW_DAYS / 7;

function loadCurrentThresholds(): AdaptiveLifecycleThresholds | null {
  return safeReadJSON<AdaptiveLifecycleThresholds | null>(THRESHOLDS_PATH, null);
}

function saveThresholds(t: AdaptiveLifecycleThresholds): void {
  atomicWriteJSON(THRESHOLDS_PATH, t, { pretty: true });
}

function clampThreshold(value: number, floor: number, ceiling: number): number {
  return Math.max(floor, Math.min(ceiling, Math.round(value)));
}

function computeLearningVelocity(): { velocity: number; totalSolutions: number } {
  try {
    if (!fs.existsSync(ME_SOLUTIONS)) return { velocity: 0, totalSolutions: 0 };
    const files = fs.readdirSync(ME_SOLUTIONS).filter((f) => f.endsWith('.md'));
    const now = Date.now();
    const windowMs = VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let recentCount = 0;
    let totalSolutions = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(ME_SOLUTIONS, file), 'utf-8');
        const fm = parseFrontmatterOnly(content) as SolutionFrontmatter | null;
        if (!fm || fm.status === 'retired') continue;
        totalSolutions++;

        const created = fm.created ? new Date(fm.created).getTime() : 0;
        if (created > 0 && now - created <= windowMs) {
          recentCount++;
        }
      } catch {}
    }

    return {
      velocity: recentCount / WEEKS_IN_WINDOW,
      totalSolutions,
    };
  } catch {
    return { velocity: 0, totalSolutions: 0 };
  }
}

/**
 * Compute adaptive promotion thresholds based on learning velocity.
 * Returns null if cold-start conditions are not met.
 */
export function computeAdaptiveThresholds(
  config: MetaLearningConfig,
): AdaptiveLifecycleThresholds | null {
  const { velocity, totalSolutions } = computeLearningVelocity();

  // Cold-start check
  if (totalSolutions < config.coldStart.minSolutionsForThresholds) {
    return null;
  }

  const current = loadCurrentThresholds();
  const base = current ?? {
    experiment: { ...DEFAULT_PROMOTION_THRESHOLDS.experiment },
    candidate: { ...DEFAULT_PROMOTION_THRESHOLDS.candidate },
    verified: { ...DEFAULT_PROMOTION_THRESHOLDS.verified },
    learningVelocity: velocity,
    updatedAt: new Date().toISOString(),
    sampleSize: totalSolutions,
    defaults: { ...DEFAULT_PROMOTION_THRESHOLDS },
  };

  // Determine adjustment direction
  const { maxThresholdDelta, thresholdFloor, thresholdCeiling } = config.guardrails;
  let delta = 0;
  if (velocity > 3) {
    delta = maxThresholdDelta; // high volume → stricter
  } else if (velocity < 0.5) {
    delta = -maxThresholdDelta; // slow pace → more lenient
  }

  if (delta === 0 && current) {
    // No change needed, but update metadata
    current.learningVelocity = velocity;
    current.sampleSize = totalSolutions;
    current.updatedAt = new Date().toISOString();
    saveThresholds(current);
    return current;
  }

  const result: AdaptiveLifecycleThresholds = {
    experiment: {
      reflected: clampThreshold(
        base.experiment.reflected + delta,
        thresholdFloor,
        thresholdCeiling,
      ),
      sessions: clampThreshold(base.experiment.sessions + delta, thresholdFloor, thresholdCeiling),
      reExtracted: clampThreshold(
        base.experiment.reExtracted + delta,
        thresholdFloor,
        thresholdCeiling,
      ),
    },
    candidate: {
      reflected: clampThreshold(base.candidate.reflected + delta, thresholdFloor, thresholdCeiling),
      sessions: clampThreshold(base.candidate.sessions + delta, thresholdFloor, thresholdCeiling),
      reExtracted: clampThreshold(
        base.candidate.reExtracted + delta,
        thresholdFloor,
        thresholdCeiling,
      ),
    },
    verified: {
      reflected: clampThreshold(base.verified.reflected + delta, thresholdFloor, thresholdCeiling),
      sessions: clampThreshold(base.verified.sessions + delta, thresholdFloor, thresholdCeiling),
      reExtracted: clampThreshold(
        base.verified.reExtracted + delta,
        thresholdFloor,
        thresholdCeiling,
      ),
      negative: base.verified.negative, // negative threshold does not adapt
    },
    learningVelocity: velocity,
    updatedAt: new Date().toISOString(),
    sampleSize: totalSolutions,
    defaults: { ...DEFAULT_PROMOTION_THRESHOLDS },
  };

  saveThresholds(result);
  return result;
}
