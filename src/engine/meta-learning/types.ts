/**
 * Forgen Meta-Learning — Shared Types
 *
 * HyperAgents-inspired self-tuning layer above the compound system.
 * All types consumed by the meta-learning runner and its sub-modules.
 */

// ── Session Quality (Feature 1) ──

export interface SessionQualityScore {
  sessionId: string;
  /** corrections per prompt in this session */
  correctionRate: number;
  /** final EWMA drift score (0-100) */
  driftScore: number;
  /** total reverts detected */
  revertCount: number;
  /** reflected / injected ratio (0-1, NaN → 0 if no injections) */
  solutionEffectiveness: number;
  /** composite score 0-100 (higher = better) */
  overallScore: number;
  /** which solutions were injected this session */
  injectedSolutions: string[];
  computedAt: string;
}

// ── Matcher Weights (Feature 2) ──

export interface MatcherWeights {
  tfidf: number;
  bm25: number;
  bigram: number;
  updatedAt: string;
  /** how many solutions informed this tuning */
  sampleSize: number;
  /** monotonic version for rollback detection */
  version: number;
  /** original defaults for fallback */
  defaults: { tfidf: number; bm25: number; bigram: number };
}

// ── Adaptive Lifecycle Thresholds (Feature 4) ──

export interface PromotionThresholds {
  reflected: number;
  sessions: number;
  reExtracted: number;
}

export interface AdaptiveLifecycleThresholds {
  experiment: PromotionThresholds;
  candidate: PromotionThresholds;
  verified: PromotionThresholds & { negative: number };
  /** solutions per week */
  learningVelocity: number;
  updatedAt: string;
  sampleSize: number;
  defaults: {
    experiment: PromotionThresholds;
    candidate: PromotionThresholds;
    verified: PromotionThresholds & { negative: number };
  };
}

// ── Extraction Bias (Feature 5) ──

export interface ExtractionBias {
  typeWeights: Record<string, number>;
  updatedAt: string;
  sampleSize: number;
}

// ── Project Usage Map (Feature 3) ──

export interface ProjectUsageEntry {
  projects: string[];
  updatedAt: string;
}

export interface ProjectUsageMap {
  solutions: Record<string, ProjectUsageEntry>;
}

// ── Configuration ──

export interface MetaLearningFeatures {
  sessionQualityScorer: boolean;
  matcherWeightTuning: boolean;
  scopeAutoPromotion: boolean;
  adaptiveThresholds: boolean;
  extractionTuning: boolean;
}

export interface ColdStartConfig {
  minSessionsForQuality: number;
  minSolutionsForMatcher: number;
  minSolutionsForThresholds: number;
  minSolutionsForExtraction: number;
  minProjectsForScope: number;
}

export interface GuardrailConfig {
  weightFloor: number;
  weightCeiling: number;
  maxWeightDelta: number;
  thresholdFloor: number;
  thresholdCeiling: number;
  maxThresholdDelta: number;
  degradationThreshold: number;
}

export interface MetaLearningConfig {
  enabled: boolean;
  features: MetaLearningFeatures;
  coldStart: ColdStartConfig;
  guardrails: GuardrailConfig;
}

// ── Runner Result ──

export interface MetaLearningResult {
  skipped?: boolean;
  reason?: string;
  qualityScore?: SessionQualityScore | null;
  matcherWeights?: MatcherWeights | null;
  scopePromotions?: string[];
  thresholds?: AdaptiveLifecycleThresholds | null;
  extractionBias?: ExtractionBias | null;
}

// ── Defaults ──

export const DEFAULT_CONFIG: MetaLearningConfig = {
  enabled: false,
  features: {
    sessionQualityScorer: true,
    matcherWeightTuning: true,
    scopeAutoPromotion: true,
    adaptiveThresholds: true,
    extractionTuning: true,
  },
  coldStart: {
    minSessionsForQuality: 1,
    minSolutionsForMatcher: 10,
    minSolutionsForThresholds: 15,
    minSolutionsForExtraction: 20,
    minProjectsForScope: 3,
  },
  guardrails: {
    weightFloor: 0.1,
    weightCeiling: 0.7,
    maxWeightDelta: 0.05,
    thresholdFloor: 2,
    thresholdCeiling: 15,
    maxThresholdDelta: 1,
    degradationThreshold: 0.3,
  },
};

export const DEFAULT_MATCHER_WEIGHTS: MatcherWeights['defaults'] = {
  tfidf: 0.5,
  bm25: 0.3,
  bigram: 0.2,
};

export const DEFAULT_PROMOTION_THRESHOLDS: AdaptiveLifecycleThresholds['defaults'] = {
  experiment: { reflected: 3, sessions: 3, reExtracted: 2 },
  candidate: { reflected: 4, sessions: 3, reExtracted: 2 },
  verified: { reflected: 8, sessions: 5, reExtracted: 2, negative: 1 },
};
