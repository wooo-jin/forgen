/**
 * Forgen Meta-Learning — Matcher Weight Tuner (Feature 2)
 *
 * Analyzes which scoring component (TF-IDF, BM25, Bigram) best discriminates
 * reflected vs. non-reflected solutions and adjusts ensemble weights.
 *
 * Algorithm:
 *   1. Load all non-retired solutions with evidence.injected > 0
 *   2. Partition into "effective" (reflected/injected > median) vs "ineffective"
 *   3. For each component: compute discrimination ratio (effective_mean / ineffective_mean)
 *   4. Shift weights toward the component with highest discrimination
 *   5. Apply guardrails: clamp [floor, ceiling], max delta per cycle, normalize to 1.0
 *
 * Cold-start: requires 10+ solutions with injected > 0, 3+ with reflected > 0.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, META_LEARNING_DIR } from '../../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../../hooks/shared/atomic-write.js';
import type { SolutionFrontmatter } from '../solution-format.js';
import { parseFrontmatterOnly } from '../solution-format.js';
import type { MatcherWeights, MetaLearningConfig } from './types.js';
import { DEFAULT_MATCHER_WEIGHTS } from './types.js';

const WEIGHTS_PATH = path.join(META_LEARNING_DIR, 'matcher-weights.json');

interface SolutionEffectivenessData {
  name: string;
  injected: number;
  reflected: number;
  ratio: number;
  tags: string[];
}

function loadSolutionEffectivenessData(): SolutionEffectivenessData[] {
  try {
    if (!fs.existsSync(ME_SOLUTIONS)) return [];
    const files = fs.readdirSync(ME_SOLUTIONS).filter((f) => f.endsWith('.md'));
    const data: SolutionEffectivenessData[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(ME_SOLUTIONS, file), 'utf-8');
        const fm = parseFrontmatterOnly(content) as SolutionFrontmatter | null;
        if (!fm || fm.status === 'retired') continue;
        if (!fm.evidence || fm.evidence.injected <= 0) continue;

        data.push({
          name: fm.name,
          injected: fm.evidence.injected,
          reflected: fm.evidence.reflected,
          ratio: fm.evidence.reflected / fm.evidence.injected,
          tags: fm.tags ?? [],
        });
      } catch {}
    }
    return data;
  } catch {
    return [];
  }
}

function loadCurrentWeights(): MatcherWeights | null {
  return safeReadJSON<MatcherWeights | null>(WEIGHTS_PATH, null);
}

function saveWeights(weights: MatcherWeights): void {
  atomicWriteJSON(WEIGHTS_PATH, weights, { pretty: true });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clampWeight(value: number, floor: number, ceiling: number): number {
  return Math.max(floor, Math.min(ceiling, value));
}

function normalizeWeights(w: { tfidf: number; bm25: number; bigram: number }): {
  tfidf: number;
  bm25: number;
  bigram: number;
} {
  const sum = w.tfidf + w.bm25 + w.bigram;
  if (sum <= 0) return { ...DEFAULT_MATCHER_WEIGHTS };
  return {
    tfidf: Math.round((w.tfidf / sum) * 1000) / 1000,
    bm25: Math.round((w.bm25 / sum) * 1000) / 1000,
    bigram: Math.round((w.bigram / sum) * 1000) / 1000,
  };
}

/**
 * Tune matcher ensemble weights based on solution effectiveness data.
 * Returns null if cold-start conditions are not met.
 */
export function tuneMatcherWeights(config: MetaLearningConfig): MatcherWeights | null {
  const data = loadSolutionEffectivenessData();

  // Cold-start check
  const injectedCount = data.length;
  const reflectedCount = data.filter((d) => d.reflected > 0).length;
  if (injectedCount < config.coldStart.minSolutionsForMatcher || reflectedCount < 3) {
    return null;
  }

  // Partition by median effectiveness ratio
  const ratios = data.map((d) => d.ratio);
  const medianRatio = median(ratios);

  const effective = data.filter((d) => d.ratio > medianRatio);
  const ineffective = data.filter((d) => d.ratio <= medianRatio);

  if (effective.length === 0 || ineffective.length === 0) return null;

  // Compute discrimination signals per component.
  // We use tag count as a proxy for component contribution:
  //   - TF-IDF benefits from more exact tag matches
  //   - BM25 benefits from longer documents (more tags)
  //   - Bigram benefits from partial/fuzzy matches (shorter tags)
  //
  // Since we can't replay the exact scoring without the original queries,
  // we use statistical proxies from the solution characteristics.
  const avgTagsEffective = effective.reduce((s, d) => s + d.tags.length, 0) / effective.length;
  const avgTagsIneffective =
    ineffective.reduce((s, d) => s + d.tags.length, 0) / ineffective.length;

  // Discrimination signals:
  //   - If effective solutions have more tags → BM25 (length normalization) discriminates well
  //   - If effective solutions have fewer tags → TF-IDF (exact match) discriminates well
  //   - Bigram gets a boost proportional to how many effective solutions have short tags
  const tagRatio = avgTagsEffective / Math.max(avgTagsIneffective, 1);
  const shortTagEffective =
    effective.filter((d) => d.tags.some((t) => t.length <= 5)).length / effective.length;

  // Raw discrimination scores (higher = more discriminating)
  const tfidfSignal = tagRatio < 1 ? 1.2 : 1.0; // exact match helps when effective have fewer tags
  const bm25Signal = tagRatio > 1 ? 1.2 : 1.0; // length normalization helps when effective have more tags
  const bigramSignal = shortTagEffective > 0.5 ? 1.15 : 0.95; // fuzzy match helps with short tags

  // Load current weights or defaults
  const current = loadCurrentWeights();
  const currentW = current
    ? { tfidf: current.tfidf, bm25: current.bm25, bigram: current.bigram }
    : { ...DEFAULT_MATCHER_WEIGHTS };

  // Compute target weights from discrimination signals
  const signalSum = tfidfSignal + bm25Signal + bigramSignal;
  const targetW = {
    tfidf: tfidfSignal / signalSum,
    bm25: bm25Signal / signalSum,
    bigram: bigramSignal / signalSum,
  };

  // Apply max delta per cycle guardrail
  const { maxWeightDelta, weightFloor, weightCeiling } = config.guardrails;
  const newW = {
    tfidf: clampWeight(
      currentW.tfidf +
        Math.max(-maxWeightDelta, Math.min(maxWeightDelta, targetW.tfidf - currentW.tfidf)),
      weightFloor,
      weightCeiling,
    ),
    bm25: clampWeight(
      currentW.bm25 +
        Math.max(-maxWeightDelta, Math.min(maxWeightDelta, targetW.bm25 - currentW.bm25)),
      weightFloor,
      weightCeiling,
    ),
    bigram: clampWeight(
      currentW.bigram +
        Math.max(-maxWeightDelta, Math.min(maxWeightDelta, targetW.bigram - currentW.bigram)),
      weightFloor,
      weightCeiling,
    ),
  };

  // Normalize to sum = 1.0
  const normalized = normalizeWeights(newW);

  const result: MatcherWeights = {
    ...normalized,
    updatedAt: new Date().toISOString(),
    sampleSize: data.length,
    version: (current?.version ?? 0) + 1,
    defaults: { ...DEFAULT_MATCHER_WEIGHTS },
  };

  saveWeights(result);
  return result;
}
