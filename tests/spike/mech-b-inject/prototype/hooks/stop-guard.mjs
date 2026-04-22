#!/usr/bin/env node
/**
 * Spike/mech-b-a1 — standalone Stop hook prototype.
 *
 * Self-contained: no forgen runtime deps. Loads scenarios.json (rules only),
 * reads stdin (Stop hook JSON), inspects the last assistant message from
 * transcript_path (or FORGEN_SPIKE_LAST_MESSAGE), evaluates Mech-B verifiers,
 * emits approve or blockStop JSON.
 *
 * Day-3 runner invokes this via `claude --plugin-dir <prototype>`.
 * Run trace appended to FORGEN_SPIKE_TRACE (JSONL) if set — runner uses this
 * to label pass/fail instead of guessing from Claude output alone.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK_NAME = 'stop-guard';

const SCENARIOS_PATH =
  process.env.FORGEN_SPIKE_RULES ??
  path.resolve(process.cwd(), 'tests/spike/mech-b-inject/scenarios.json');

function approve() {
  return JSON.stringify({ continue: true });
}

function blockStop(reason, systemMessage) {
  return JSON.stringify({
    continue: true,
    decision: 'block',
    reason,
    ...(systemMessage ? { systemMessage } : {}),
  });
}

function trace(entry) {
  const tracePath = process.env.FORGEN_SPIKE_TRACE;
  if (!tracePath) return;
  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, JSON.stringify({ at: Date.now(), ...entry }) + '\n');
  } catch { /* trace best-effort */ }
}

async function readStdinJSON(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const chunks = [];
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (typeof process.stdin.resume === 'function') process.stdin.resume();
    process.stdin.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('utf-8');
      try { finish(JSON.parse(raw)); } catch { finish(null); }
    });
    process.stdin.on('error', () => { clearTimeout(timer); finish(null); });
  });
}

function loadStopRules() {
  try {
    const raw = fs.readFileSync(SCENARIOS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return (parsed.rules ?? []).filter((r) => r.hook === 'Stop');
  } catch (e) {
    trace({ event: 'rules-load-failed', error: String(e), path: SCENARIOS_PATH });
    return [];
  }
}

function readLastAssistantMessage(input) {
  // Runner/test override (highest priority)
  const injected = process.env.FORGEN_SPIKE_LAST_MESSAGE;
  if (injected) return injected;

  // Claude Code Stop hook passes last_assistant_message directly — no transcript parse needed.
  if (input && typeof input.last_assistant_message === 'string' && input.last_assistant_message) {
    return input.last_assistant_message;
  }

  // Fallback: parse transcript_path if last_assistant_message is absent.
  const transcriptPath = input?.transcript_path;
  if (!transcriptPath) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        const role = entry.role ?? entry.message?.role ?? entry.type;
        const content = entry.content ?? entry.message?.content ?? entry.text;
        if (role !== 'assistant') continue;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          const parts = content
            .map((p) => {
              if (typeof p === 'string') return p;
              if (p && typeof p === 'object' && 'text' in p) return String(p.text);
              return '';
            })
            .filter(Boolean);
          if (parts.length) return parts.join('\n');
        }
      } catch { /* skip */ }
    }
    return null;
  } catch {
    return null;
  }
}

function messageTriggers(message, rule) {
  const t = rule.trigger ?? {};
  if (!t.response_keywords_regex) return false;
  if (!new RegExp(t.response_keywords_regex, 'i').test(message)) return false;
  if (t.context_exclude_regex && new RegExp(t.context_exclude_regex, 'i').test(message)) return false;
  return true;
}

function artifactFresh(relOrAbs, maxAgeS) {
  const base = path.join(os.homedir(), '.forgen', 'state');
  let p = relOrAbs;
  if (String(relOrAbs).startsWith('.forgen/state/')) {
    p = path.join(os.homedir(), relOrAbs);
  } else if (!path.isAbsolute(relOrAbs)) {
    p = path.join(base, relOrAbs);
  }
  try {
    const st = fs.statSync(p);
    if (!maxAgeS || maxAgeS <= 0) return true;
    return Date.now() - st.mtimeMs <= maxAgeS * 1000;
  } catch {
    return false;
  }
}

function evaluate(message, rules) {
  for (const rule of rules) {
    if (rule.hook !== 'Stop') continue;
    if (!messageTriggers(message, rule)) continue;
    const v = rule.verifier ?? {};
    if (v.kind === 'self_check_prompt') {
      const question = String(v.params?.question ?? rule.block_message ?? 'self-check required');
      const evidencePath = v.params?.evidence_path;
      if (typeof evidencePath === 'string' && artifactFresh(evidencePath, Number(v.params?.max_age_s ?? 0))) {
        return { action: 'approve', hit: rule };
      }
      return { action: 'block', hit: rule, reason: question };
    }
    if (v.kind === 'artifact_check') {
      const ok = artifactFresh(String(v.params?.path ?? ''), Number(v.params?.max_age_s ?? 0));
      if (!ok) return { action: 'block', hit: rule, reason: rule.block_message ?? 'artifact missing' };
    }
  }
  return { action: 'approve', hit: null };
}

async function main() {
  const started = Date.now();
  try {
    const input = await readStdinJSON();
    trace({
      hook: HOOK_NAME,
      event: 'stdin-received',
      keys: input ? Object.keys(input) : null,
      transcript_path: input?.transcript_path ?? null,
      has_env_message: !!process.env.FORGEN_SPIKE_LAST_MESSAGE,
    });
    const message = readLastAssistantMessage(input);
    if (!message) {
      trace({ hook: HOOK_NAME, event: 'approve-no-message' });
      console.log(approve());
      return;
    }

    const rules = loadStopRules();
    if (rules.length === 0) {
      trace({ hook: HOOK_NAME, event: 'approve-no-rules' });
      console.log(approve());
      return;
    }

    const result = evaluate(message, rules);
    if (result.action === 'approve') {
      trace({
        hook: HOOK_NAME,
        event: 'approve',
        message_preview: message.slice(0, 80),
        elapsed_ms: Date.now() - started,
      });
      console.log(approve());
      return;
    }

    trace({
      hook: HOOK_NAME,
      event: 'block',
      rule_id: result.hit.id,
      reason_preview: result.reason.slice(0, 120),
      system_tag: result.hit.system_tag,
      elapsed_ms: Date.now() - started,
    });
    console.log(blockStop(result.reason, result.hit.system_tag));
  } catch (e) {
    trace({ hook: HOOK_NAME, event: 'exception', error: String(e) });
    console.log(approve()); // fail-open
  }
}

main();
