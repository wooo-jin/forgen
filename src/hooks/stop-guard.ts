#!/usr/bin/env node
/**
 * Forgen — Stop Guard (Mech-B prototype, spike/mech-b-a1)
 *
 * Stop hook: 어시스턴트 직전 응답에서 "완료 선언" 패턴을 감지하고, 연결된
 * Mech-A(artifact_check) / Mech-B(self_check_prompt) 규칙을 평가하여
 * 위반 시 blockStop 으로 세션을 재개시킨다.
 *
 * Prototype scope (spike only — NOT v0.4.0 final):
 *   - 규칙은 tests/spike/mech-b-inject/scenarios.json 에서 로드
 *     (FORGEN_SPIKE_RULES env 로 override 가능)
 *   - 어시스턴트 메시지는 transcript_path 에서 마지막 assistant 턴을 뽑거나
 *     FORGEN_SPIKE_LAST_MESSAGE env 로 주입 가능 (runner/단위테스트용)
 *   - artifact_check 는 `~/.forgen/state/<relative>` 경로를 기준으로 평가
 *
 * 설계 제약 (ADR-001, Day-1 verification):
 *   - self_check_prompt 질문은 **reason** 에 전체를 담는다 (모델 도달).
 *   - systemMessage 는 rule tag 한 줄만 (UI 표시 보조).
 *   - 외부 LLM API 호출 없음 (β1 유지).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readStdinJSON } from './shared/read-stdin.js';
import { approve, blockStop, failOpenWithTracking } from './shared/hook-response.js';
import { recordHookTiming } from './shared/hook-timing.js';
import { isHookEnabled } from './hook-config.js';

const HOOK_NAME = 'stop-guard';

interface VerifierSpec {
  kind: 'self_check_prompt' | 'artifact_check' | 'tool_arg_regex';
  params: Record<string, string | number | boolean>;
}

interface SpikeRule {
  id: string;
  mech: 'A' | 'B' | 'C';
  hook: 'Stop' | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit';
  trigger: {
    response_keywords_regex?: string;
    context_exclude_regex?: string;
  };
  verifier: VerifierSpec;
  block_message?: string;
  system_tag?: string;
}

interface ScenariosFile {
  rules: SpikeRule[];
}

interface StopHookInput {
  session_id?: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

/** Spike-only rule loader. v0.4.0 final은 ~/.forgen/me/rules에서 로드. */
function loadStopRules(): SpikeRule[] {
  const override = process.env.FORGEN_SPIKE_RULES;
  const defaultPath = path.join(
    process.cwd(),
    'tests',
    'spike',
    'mech-b-inject',
    'scenarios.json'
  );
  const rulesPath = override ?? defaultPath;
  try {
    const raw = fs.readFileSync(rulesPath, 'utf-8');
    const parsed = JSON.parse(raw) as ScenariosFile;
    return (parsed.rules ?? []).filter((r) => r.hook === 'Stop');
  } catch {
    return [];
  }
}

/** transcript_path 의 마지막 assistant 턴 텍스트를 반환. 실패 시 null. */
function readLastAssistantMessage(transcriptPath?: string): string | null {
  // Test/runner 주입 경로
  const injected = process.env.FORGEN_SPIKE_LAST_MESSAGE;
  if (injected) return injected;

  if (!transcriptPath) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
    // 최신부터 역순으로 assistant 턴 탐색 (JSONL 형식)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as { role?: string; content?: unknown };
        if (entry.role !== 'assistant') continue;
        if (typeof entry.content === 'string') return entry.content;
        if (Array.isArray(entry.content)) {
          const parts = entry.content
            .map((p: unknown) => {
              if (typeof p === 'string') return p;
              if (p && typeof p === 'object' && 'text' in p) return String((p as { text: unknown }).text);
              return '';
            })
            .filter(Boolean);
          if (parts.length) return parts.join('\n');
        }
      } catch {
        // skip malformed line
      }
    }
    return null;
  } catch {
    return null;
  }
}

function messageTriggersRule(message: string, rule: SpikeRule): boolean {
  const t = rule.trigger;
  if (!t.response_keywords_regex) return false;
  const include = new RegExp(t.response_keywords_regex, 'i');
  if (!include.test(message)) return false;
  if (t.context_exclude_regex) {
    const exclude = new RegExp(t.context_exclude_regex, 'i');
    if (exclude.test(message)) return false;
  }
  return true;
}

function evaluateVerifier(rule: SpikeRule): { violated: boolean; reason: string } {
  const v = rule.verifier;
  if (v.kind === 'self_check_prompt') {
    const q = String(v.params.question ?? rule.block_message ?? '자가점검 필요');
    // self_check_prompt 는 증거가 없으면(artifact path 미지정/미존재) 위반 간주.
    const evidencePath = v.params.evidence_path;
    if (typeof evidencePath === 'string') {
      const maxAge = Number(v.params.max_age_s ?? 0);
      const ok = artifactFresh(String(evidencePath), maxAge);
      if (ok) return { violated: false, reason: '' };
    }
    return { violated: true, reason: q };
  }
  if (v.kind === 'artifact_check') {
    const p = String(v.params.path ?? '');
    const maxAge = Number(v.params.max_age_s ?? 0);
    return artifactFresh(p, maxAge)
      ? { violated: false, reason: '' }
      : { violated: true, reason: rule.block_message ?? `증거 파일(${p})이 최근 ${maxAge}s 내 갱신되지 않음` };
  }
  // tool_arg_regex 는 PreToolUse 전용 → Stop 에서는 no-op
  return { violated: false, reason: '' };
}

/** artifact 경로를 ~/.forgen/state/ 기준으로 해석하고 최근 갱신 여부를 확인. */
function artifactFresh(relOrAbs: string, maxAgeS: number): boolean {
  const base = path.join(os.homedir(), '.forgen', 'state');
  // 절대/상대 혼용: '.forgen/state/...' 로 시작하면 homedir 기준으로 붙임
  let p = relOrAbs;
  if (relOrAbs.startsWith('.forgen/state/')) {
    p = path.join(os.homedir(), relOrAbs);
  } else if (!path.isAbsolute(relOrAbs)) {
    p = path.join(base, relOrAbs);
  }
  try {
    const st = fs.statSync(p);
    if (maxAgeS <= 0) return true;
    const ageMs = Date.now() - st.mtimeMs;
    return ageMs <= maxAgeS * 1000;
  } catch {
    return false;
  }
}

/** Pure core — 단위 테스트용. stdin/IO 없음. */
export function evaluateStop(
  lastAssistantMessage: string,
  rules: SpikeRule[]
): { action: 'approve'; hit: null } | { action: 'block'; hit: SpikeRule; reason: string } {
  for (const rule of rules) {
    if (rule.hook !== 'Stop') continue;
    if (!messageTriggersRule(lastAssistantMessage, rule)) continue;
    const result = evaluateVerifier(rule);
    if (result.violated) {
      return { action: 'block', hit: rule, reason: result.reason };
    }
  }
  return { action: 'approve', hit: null };
}

export async function main(): Promise<void> {
  const started = Date.now();
  try {
    if (!isHookEnabled(HOOK_NAME)) {
      console.log(approve());
      return;
    }

    const input = await readStdinJSON<StopHookInput>();
    const transcriptPath = input?.transcript_path;

    const lastMessage = readLastAssistantMessage(transcriptPath);
    if (!lastMessage) {
      console.log(approve());
      return;
    }

    const rules = loadStopRules();
    if (rules.length === 0) {
      console.log(approve());
      return;
    }

    const result = evaluateStop(lastMessage, rules);
    if (result.action === 'approve') {
      console.log(approve());
      return;
    }

    const { hit, reason } = result;
    console.log(blockStop(reason, hit.system_tag));
  } catch {
    console.log(failOpenWithTracking(HOOK_NAME));
  } finally {
    recordHookTiming(HOOK_NAME, Date.now() - started, 'Stop');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  void main();
}
