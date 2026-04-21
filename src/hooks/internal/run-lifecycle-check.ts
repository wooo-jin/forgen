#!/usr/bin/env node
/**
 * Forgen — Internal runner: compound lifecycle check.
 *
 * Spawned by `session-recovery.ts` as a detached background process.
 * Exists as a dedicated script file so the caller can pass `sessionId`
 * via argv instead of interpolating it into a `-e` template literal.
 *
 * Audit finding #5 (2026-04-21): prior call site used
 *   spawn('node', ['--input-type=module', '-e',
 *     `import('${path}').then(m => m.runLifecycleCheck('${sessionId}'))`])
 * which interpolated `sessionId` (originating from hook stdin) into
 * executable JS source. An attacker-controlled session id of the shape
 * `a'); malicious(); //` would have executed arbitrary JS under the
 * user's Claude-Code privileges. A dedicated script + argv lookup has
 * no shell or eval surface.
 *
 * Contract: `process.argv[2]` is the session id. Any extra args are
 * ignored. stdout/stderr are ignored by the caller (`stdio: 'ignore'`).
 */
import { runLifecycleCheck } from '../../engine/compound-lifecycle.js';

const sessionId = process.argv[2];
if (!sessionId || typeof sessionId !== 'string') {
  process.exit(0);
}

try {
  runLifecycleCheck(sessionId);
} catch {
  // Detached background — best effort. Surfacing errors would have no
  // consumer and the parent hook already logged the spawn.
}
