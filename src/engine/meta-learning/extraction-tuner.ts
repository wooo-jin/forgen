/**
 * Forgen Meta-Learning — Extraction Tuner (Feature 5)
 *
 * Tracks which solution types (pattern, solution, decision, etc.) have the
 * best reflected/injected ratio and biases future extraction toward those types.
 *
 * Uses Laplace smoothing (pseudo-count +1) to prevent zero weights
 * for underrepresented types.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, META_LEARNING_DIR } from '../../core/paths.js';
import { atomicWriteJSON } from '../../hooks/shared/atomic-write.js';
import type { SolutionFrontmatter, SolutionType } from '../solution-format.js';
import { parseFrontmatterOnly } from '../solution-format.js';
import type { ExtractionBias, MetaLearningConfig } from './types.js';

const BIAS_PATH = path.join(META_LEARNING_DIR, 'extraction-bias.json');

const ALL_TYPES: SolutionType[] = [
  'pattern',
  'solution',
  'decision',
  'troubleshoot',
  'anti-pattern',
  'convention',
];

interface TypeStats {
  injected: number;
  reflected: number;
  ratio: number;
}

function computeTypeEffectiveness(): {
  stats: Record<string, TypeStats>;
  totalSolutions: number;
  typeCount: number;
} {
  const stats: Record<string, TypeStats> = {};
  for (const t of ALL_TYPES) {
    stats[t] = { injected: 0, reflected: 0, ratio: 0 };
  }

  let totalSolutions = 0;
  const typesWithData = new Set<string>();

  try {
    if (!fs.existsSync(ME_SOLUTIONS)) return { stats, totalSolutions: 0, typeCount: 0 };
    const files = fs.readdirSync(ME_SOLUTIONS).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(ME_SOLUTIONS, file), 'utf-8');
        const fm = parseFrontmatterOnly(content) as SolutionFrontmatter | null;
        if (!fm || fm.status === 'retired') continue;
        totalSolutions++;

        const type = fm.type;
        if (!stats[type]) stats[type] = { injected: 0, reflected: 0, ratio: 0 };

        stats[type].injected += fm.evidence.injected;
        stats[type].reflected += fm.evidence.reflected;
        if (fm.evidence.injected > 0) typesWithData.add(type);
      } catch {}
    }
  } catch {
    /* empty */
  }

  // Compute ratios
  for (const type of Object.keys(stats)) {
    stats[type].ratio = stats[type].injected > 0 ? stats[type].reflected / stats[type].injected : 0;
  }

  return { stats, totalSolutions, typeCount: typesWithData.size };
}

/**
 * Compute extraction bias based on type effectiveness.
 * Returns null if cold-start conditions are not met.
 */
export function computeExtractionBias(config: MetaLearningConfig): ExtractionBias | null {
  const { stats, totalSolutions, typeCount } = computeTypeEffectiveness();

  // Cold-start check
  if (totalSolutions < config.coldStart.minSolutionsForExtraction || typeCount < 3) {
    return null;
  }

  // Laplace-smoothed weights: ratio + 1 pseudo-count per type
  const rawWeights: Record<string, number> = {};
  let sum = 0;
  for (const type of ALL_TYPES) {
    const w = stats[type].ratio + 1 / ALL_TYPES.length; // Laplace smoothing
    rawWeights[type] = w;
    sum += w;
  }

  // Normalize to sum = 1.0, cap individual type at 0.5
  const typeWeights: Record<string, number> = {};
  for (const type of ALL_TYPES) {
    typeWeights[type] = Math.min(0.5, Math.round((rawWeights[type] / sum) * 1000) / 1000);
  }

  // Re-normalize after capping
  const cappedSum = Object.values(typeWeights).reduce((s, v) => s + v, 0);
  if (cappedSum > 0) {
    for (const type of ALL_TYPES) {
      typeWeights[type] = Math.round((typeWeights[type] / cappedSum) * 1000) / 1000;
    }
  }

  const result: ExtractionBias = {
    typeWeights,
    updatedAt: new Date().toISOString(),
    sampleSize: totalSolutions,
  };

  atomicWriteJSON(BIAS_PATH, result, { pretty: true });
  return result;
}
