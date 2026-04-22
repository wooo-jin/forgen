#!/usr/bin/env node
/**
 * Spike/mech-b-a1 — PreToolUse Mech-A prototype (R-A control group).
 *
 * Bash command 입력을 tool_arg_regex verifier 로 검사.
 * session_state 의 user_confirmed 가 없으면 deny.
 *
 * 프로토타입이므로 user_confirmed 는 환경변수(FORGEN_SPIKE_USER_CONFIRMED=1) 로 시뮬레이트.
 * v0.4.0 최종 구현에서는 PostToolUse 에서 사용자 확인 이벤트 포착 후 session 상태에 저장.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const HOOK_NAME = 'pre-tool-guard';

const SCENARIOS_PATH =
  process.env.FORGEN_SPIKE_RULES ??
  path.resolve(process.cwd(), 'tests/spike/mech-b-inject/scenarios.json');

function approve() {
  return JSON.stringify({ continue: true });
}

function deny(reason) {
  return JSON.stringify({
    continue: false,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

function trace(entry) {
  const tracePath = process.env.FORGEN_SPIKE_TRACE;
  if (!tracePath) return;
  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, JSON.stringify({ at: Date.now(), ...entry }) + '\n');
  } catch {}
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

function loadPreToolRules() {
  try {
    const raw = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf-8'));
    return (raw.rules ?? []).filter((r) => r.hook === 'PreToolUse');
  } catch {
    return [];
  }
}

async function main() {
  const started = Date.now();
  try {
    const input = await readStdinJSON();
    const toolName = input?.tool_name ?? input?.toolName;
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};

    trace({
      hook: HOOK_NAME,
      event: 'stdin-received',
      tool_name: toolName,
      command_preview: typeof toolInput.command === 'string' ? toolInput.command.slice(0, 120) : null,
    });

    const rules = loadPreToolRules();
    if (rules.length === 0) { console.log(approve()); return; }

    for (const rule of rules) {
      const trigger = rule.trigger ?? {};
      if (trigger.tool && trigger.tool !== toolName) continue;
      if (trigger.command_regex && typeof toolInput.command === 'string') {
        if (!new RegExp(trigger.command_regex, 'i').test(toolInput.command)) continue;
      }

      // verifier: tool_arg_regex — requires_flag 가 있는데 세션에 flag 없음 → deny
      const v = rule.verifier ?? {};
      if (v.kind === 'tool_arg_regex') {
        const requiresFlag = v.params?.requires_flag;
        const confirmed = process.env.FORGEN_SPIKE_USER_CONFIRMED === '1';
        if (requiresFlag && !confirmed) {
          const reason = rule.block_message ?? `${rule.id}: confirm 필요`;
          trace({
            hook: HOOK_NAME,
            event: 'deny',
            rule_id: rule.id,
            reason_preview: reason.slice(0, 120),
            elapsed_ms: Date.now() - started,
          });
          console.log(deny(reason));
          return;
        }
      }
    }

    trace({ hook: HOOK_NAME, event: 'approve', elapsed_ms: Date.now() - started });
    console.log(approve());
  } catch (e) {
    trace({ hook: HOOK_NAME, event: 'exception', error: String(e) });
    console.log(approve()); // fail-open
  }
}

main();
