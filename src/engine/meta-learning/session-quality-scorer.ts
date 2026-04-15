/**
 * Forgen Meta-Learning — Session Quality Scorer (Feature 1)
 *
 * Joins existing data sources to compute a per-session quality score.
 * This score feeds other meta-learning features (matcher tuning, thresholds).
 *
 * Data sources:
 *   - injection-cache-{sessionId}.json → injected solutions
 *   - modified-files-{sessionId}.json  → drift state
 *   - implicit-feedback.jsonl          → revert/drift events
 *   - me/behavior/*.json              → correction evidence
 *   - state/sessions/{sessionId}.json  → session metadata
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_BEHAVIOR, STATE_DIR } from '../../core/paths.js';
import { safeReadJSON } from '../../hooks/shared/atomic-write.js';
import type { SessionQualityScore } from './types.js';

// ── Data loaders ──

interface InjectionCacheData {
  injected: string[];
  totalInjectedChars: number;
  updatedAt: string;
  /** Tag snapshot per solution (backfill feature) */
  tags?: Record<string, string[]>;
}

interface DriftState {
  sessionId: string;
  totalEdits: number;
  totalReverts: number;
  ewmaEditRate: number;
  ewmaRevertRate: number;
  lastWarningAt: number | null;
  lastCriticalAt: number | null;
  hardCapReached: boolean;
}

interface ModifiedFilesState {
  sessionId: string;
  files: Record<string, { count: number; lastModified: string; tool: string }>;
  toolCallCount: number;
  recentWrites?: Record<string, string[]>;
  drift?: DriftState;
}

interface ImplicitFeedbackEntry {
  type: string;
  sessionId?: string;
  at: string;
  [key: string]: unknown;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function loadInjectionCache(sessionId: string): InjectionCacheData | null {
  const cachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  return safeReadJSON<InjectionCacheData | null>(cachePath, null);
}

function loadSolutionCache(sessionId: string): InjectionCacheData | null {
  const cachePath = path.join(STATE_DIR, `solution-cache-${sanitizeId(sessionId)}.json`);
  return safeReadJSON<InjectionCacheData | null>(cachePath, null);
}

export function loadDriftState(sessionId: string): DriftState | null {
  const statePath = path.join(STATE_DIR, `modified-files-${sanitizeId(sessionId)}.json`);
  const data = safeReadJSON<ModifiedFilesState | null>(statePath, null);
  return data?.drift ?? null;
}

export function loadImplicitFeedback(sessionId: string): ImplicitFeedbackEntry[] {
  const logPath = path.join(STATE_DIR, 'implicit-feedback.jsonl');
  try {
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    const entries: ImplicitFeedbackEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ImplicitFeedbackEntry;
        if (entry.sessionId === sessionId) entries.push(entry);
      } catch {
        /* skip malformed lines */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function loadSessionCorrections(sessionId: string): number {
  try {
    if (!fs.existsSync(ME_BEHAVIOR)) return 0;
    let count = 0;
    for (const file of fs.readdirSync(ME_BEHAVIOR)) {
      if (!file.endsWith('.json')) continue;
      const data = safeReadJSON<{ session_id?: string; type?: string } | null>(
        path.join(ME_BEHAVIOR, file),
        null,
      );
      if (data?.session_id === sessionId && data?.type === 'explicit_correction') {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function loadToolCallCount(sessionId: string): number {
  const statePath = path.join(STATE_DIR, `modified-files-${sanitizeId(sessionId)}.json`);
  const data = safeReadJSON<ModifiedFilesState | null>(statePath, null);
  return data?.toolCallCount ?? 0;
}

// ── Score computation ──

/**
 * Compute overall session quality score (0-100, higher = better).
 *
 * Formula:
 *   100
 *   - (correctionRate × 15)        // each correction/prompt penalizes 15pts
 *   - (driftScore × 0.3)           // drift 0-100 maps to 0-30 penalty
 *   - (revertCount × 5)            // each revert penalizes 5pts
 *   + (solutionEffectiveness × 20) // good solution usage boosts 0-20pts
 */
export function computeOverallScore(
  correctionRate: number,
  driftScore: number,
  revertCount: number,
  solutionEffectiveness: number,
): number {
  const raw =
    100 - correctionRate * 15 - driftScore * 0.3 - revertCount * 5 + solutionEffectiveness * 20;
  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
}

// ── Main entry ──

/**
 * Score a session's quality by joining all available data sources.
 * Returns null if insufficient data (no session state found).
 */
export function scoreSession(sessionId: string): SessionQualityScore | null {
  // Load injected solutions — try both caches
  const injectionCache = loadInjectionCache(sessionId);
  const solutionCache = loadSolutionCache(sessionId);
  const injectedSolutions = injectionCache?.injected ?? solutionCache?.injected ?? [];

  // Load drift state
  const drift = loadDriftState(sessionId);
  const driftScore = drift ? Math.min(100, drift.ewmaEditRate * 65 + drift.ewmaRevertRate * 35) : 0;
  const revertCount = drift?.totalReverts ?? 0;

  // Count corrections
  const corrections = loadSessionCorrections(sessionId);
  const toolCallCount = loadToolCallCount(sessionId);
  // Use toolCallCount as proxy for prompt count (each prompt leads to tool calls)
  const promptEstimate = Math.max(1, Math.ceil(toolCallCount / 3));
  const correctionRate = corrections / promptEstimate;

  // Solution effectiveness: we can only measure at session level
  // by checking how many injected solutions have reflected > 0.
  // For per-session granularity, count revert events as negative signal.
  const implicitFeedback = loadImplicitFeedback(sessionId);
  const revertEvents = implicitFeedback.filter((e) => e.type === 'revert_detected').length;

  // Effectiveness: 1 - (negative signals / total injections), clamped to [0, 1]
  const solutionEffectiveness =
    injectedSolutions.length > 0
      ? Math.max(0, Math.min(1, 1 - revertEvents / injectedSolutions.length))
      : 0;

  const overallScore = computeOverallScore(
    correctionRate,
    driftScore,
    revertCount,
    solutionEffectiveness,
  );

  return {
    sessionId,
    correctionRate: Math.round(correctionRate * 1000) / 1000,
    driftScore: Math.round(driftScore * 100) / 100,
    revertCount,
    solutionEffectiveness: Math.round(solutionEffectiveness * 1000) / 1000,
    overallScore,
    injectedSolutions,
    computedAt: new Date().toISOString(),
  };
}

// ── Persistence ──

export function saveSessionQuality(score: SessionQualityScore, baseDir?: string): void {
  const dir = baseDir ?? path.join(STATE_DIR, 'session-quality');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sanitizeId(score.sessionId)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(score, null, 2));
}

export function loadSessionQuality(
  sessionId: string,
  baseDir?: string,
): SessionQualityScore | null {
  const dir = baseDir ?? path.join(STATE_DIR, 'session-quality');
  const filePath = path.join(dir, `${sanitizeId(sessionId)}.json`);
  return safeReadJSON<SessionQualityScore | null>(filePath, null);
}

export function loadRecentQualityScores(
  limit: number = 10,
  baseDir?: string,
): SessionQualityScore[] {
  const dir = baseDir ?? path.join(STATE_DIR, 'session-quality');
  try {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const scores: SessionQualityScore[] = [];
    for (const file of files) {
      const score = safeReadJSON<SessionQualityScore | null>(path.join(dir, file), null);
      if (score) scores.push(score);
    }
    return scores.sort((a, b) => b.computedAt.localeCompare(a.computedAt)).slice(0, limit);
  } catch {
    return [];
  }
}
