/**
 * Forgen Meta-Learning — Scope Promoter (Feature 3)
 *
 * Tracks cross-project solution usage and auto-promotes solutions
 * from scope:'me' to scope:'universal' when used in 3+ distinct projects.
 *
 * Data flow:
 *   1. At session end: read injection-cache for injected solutions + session cwd
 *   2. Record (solution, project) pair in project-usage-map.json
 *   3. Check if any solution has 3+ distinct projects → mutate frontmatter
 */

import * as path from 'node:path';
import { META_LEARNING_DIR, STATE_DIR } from '../../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../../hooks/shared/atomic-write.js';
import { mutateSolutionByName } from '../solution-writer.js';
import type { MetaLearningConfig, ProjectUsageMap } from './types.js';

const USAGE_MAP_PATH = path.join(META_LEARNING_DIR, 'project-usage-map.json');

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function loadUsageMap(): ProjectUsageMap {
  return safeReadJSON<ProjectUsageMap>(USAGE_MAP_PATH, { solutions: {} });
}

function saveUsageMap(map: ProjectUsageMap): void {
  atomicWriteJSON(USAGE_MAP_PATH, map, { pretty: true });
}

function loadInjectedSolutions(sessionId: string): string[] {
  // Try solution-cache (primary) and injection-cache (fallback)
  for (const prefix of ['solution-cache', 'injection-cache']) {
    const cachePath = path.join(STATE_DIR, `${prefix}-${sanitizeId(sessionId)}.json`);
    const data = safeReadJSON<{ injected?: string[] }>(cachePath, {});
    if (data.injected && data.injected.length > 0) return data.injected;
  }
  return [];
}

/**
 * Record which project (cwd) each injected solution was used in.
 */
export function updateProjectUsageMap(
  sessionId: string,
  cwd: string,
  _config: MetaLearningConfig,
): void {
  const injected = loadInjectedSolutions(sessionId);
  if (injected.length === 0) return;

  // Normalize cwd to project root name for privacy
  const projectKey = path.basename(cwd);

  const map = loadUsageMap();
  let changed = false;

  for (const name of injected) {
    if (!map.solutions[name]) {
      map.solutions[name] = { projects: [projectKey], updatedAt: new Date().toISOString() };
      changed = true;
    } else if (!map.solutions[name].projects.includes(projectKey)) {
      map.solutions[name].projects.push(projectKey);
      map.solutions[name].updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) saveUsageMap(map);
}

/**
 * Check for solutions that should be promoted to universal scope.
 * Returns names of promoted solutions.
 */
export function checkScopePromotions(config: MetaLearningConfig): string[] {
  const map = loadUsageMap();
  const minProjects = config.coldStart.minProjectsForScope;
  const promoted: string[] = [];

  for (const [name, entry] of Object.entries(map.solutions)) {
    if (entry.projects.length < minProjects) continue;

    const success = mutateSolutionByName(name, (sol) => {
      if (sol.frontmatter.scope === 'universal') return false; // already promoted
      if (sol.frontmatter.scope !== 'me') return false; // only promote from 'me'
      sol.frontmatter.scope = 'universal' as typeof sol.frontmatter.scope;
      return true;
    });

    if (success) promoted.push(name);
  }

  return promoted;
}
