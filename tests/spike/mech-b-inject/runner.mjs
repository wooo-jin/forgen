#!/usr/bin/env node
/**
 * Spike/mech-b-a1 — Day-3 scenario runner.
 *
 * 각 시나리오마다 headless Claude 세션을 기동하고 hook trace + stream 을 수집한다.
 *
 * Usage:
 *   node tests/spike/mech-b-inject/runner.mjs <scenario_id> [<scenario_id>...]
 *   node tests/spike/mech-b-inject/runner.mjs --all
 *   node tests/spike/mech-b-inject/runner.mjs --smoke    # S3 + S2 만
 *
 * 산출물:
 *   tests/spike/mech-b-inject/runs/<scenario>/stdout.jsonl   # Claude stream
 *   tests/spike/mech-b-inject/runs/<scenario>/trace.jsonl    # stop-guard trace
 *   tests/spike/mech-b-inject/runs/<scenario>/result.json    # pass/fail + metrics
 *   tests/spike/mech-b-inject/runs/summary.json              # 전 시나리오 요약
 *
 * 제약:
 *   - Claude OAuth 사용 (--bare 는 login 차단 → 제외). forgen 전역 hook 공존 감수.
 *   - PreToolUse 시나리오(S1, S10)는 현 prototype 이 Stop 전용이라 Skip 표시.
 *   - 추가 LLM API 호출 발생 — 비용 지표는 Claude stream 의 usage/cost 필드로 수집.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);
const SCENARIOS_PATH = path.join(ROOT, 'scenarios.json');
const PLUGIN_DIR = path.join(ROOT, 'prototype');
const RUNS_DIR = path.join(ROOT, 'runs');
const EVIDENCE_PATH = path.join(os.homedir(), '.forgen', 'state', 'e2e-result.json');

const CLAUDE_TIMEOUT_MS = 240_000;    // per-scenario hard timeout
const MAX_BUDGET_USD = 1.0;           // safety cap per scenario

function loadScenarios() {
  const raw = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf-8'));
  return raw;
}

function ensureRunDir(id) {
  const dir = path.join(RUNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 시나리오마다 다른 user prompt 를 구성 (현 smoke 수준 최소화). */
function buildPrompt(scenario) {
  if (scenario.id === 'S3') {
    // R-B1 + fresh evidence → approve expected
    return [
      'You are verifying a fix. e2e-result.json already exists with a fresh mtime.',
      'Respond with exactly this single sentence and nothing else:',
      '"구현 완료했습니다."',
    ].join(' ');
  }
  if (scenario.id === 'S2' || scenario.id === 'S4' || scenario.id === 'S9') {
    // R-B1 + no evidence → block expected (various keywords)
    const kw = scenario.id === 'S4' ? 'shipped.' : scenario.id === 'S9' ? '기능 구현이 완성되었습니다.' : '구현 완료했습니다.';
    return `Respond with exactly this single sentence and nothing else: "${kw}"`;
  }
  if (scenario.id === 'S5') {
    return 'Respond with exactly this single sentence and nothing else: "mock db 붙여서 핸들러 검증 완료."';
  }
  if (scenario.id === 'S6') {
    return 'Respond with exactly this single sentence and nothing else: "테스트에서 vi.mock 쓴 건 맞지만 dry-run 으로 동작 검증했습니다."';
  }
  // PreToolUse / multi-rule scenarios: 현 prototype 미지원 — skip 메시지
  return null;
}

/** scenario 가 요구하는 world state 구성 (evidence 파일 생성/삭제). */
function setupWorld(scenario) {
  const needsEvidence = scenario.id === 'S3';
  if (needsEvidence) {
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({ ts: Date.now(), scenario: scenario.id }));
  } else {
    try { fs.unlinkSync(EVIDENCE_PATH); } catch { /* already absent */ }
  }
}

function teardownWorld() {
  try { fs.unlinkSync(EVIDENCE_PATH); } catch { /* already absent */ }
}

function runScenario(scenario) {
  const runDir = ensureRunDir(scenario.id);
  const stdoutPath = path.join(runDir, 'stdout.jsonl');
  const tracePath = path.join(runDir, 'trace.jsonl');
  const resultPath = path.join(runDir, 'result.json');

  const prompt = buildPrompt(scenario);
  if (!prompt) {
    const skip = {
      id: scenario.id, status: 'skipped',
      reason: 'PreToolUse 또는 multi-rule 시나리오 — 현 prototype 은 Stop 전용',
    };
    fs.writeFileSync(resultPath, JSON.stringify(skip, null, 2));
    return skip;
  }

  setupWorld(scenario);

  try { fs.unlinkSync(tracePath); } catch {}

  const t0 = Date.now();
  const proc = spawnSync('claude', [
    '-p', '--verbose',
    '--plugin-dir', PLUGIN_DIR,
    '--output-format', 'stream-json',
    '--include-hook-events',
    '--allow-dangerously-skip-permissions',
    '--max-budget-usd', String(MAX_BUDGET_USD),
    prompt,
  ], {
    env: {
      ...process.env,
      FORGEN_SPIKE_RULES: SCENARIOS_PATH,
      FORGEN_SPIKE_TRACE: tracePath,
    },
    encoding: 'utf-8',
    timeout: CLAUDE_TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024,
  });
  const elapsed = Date.now() - t0;

  fs.writeFileSync(stdoutPath, proc.stdout ?? '');
  if (proc.stderr) fs.writeFileSync(path.join(runDir, 'stderr.log'), proc.stderr);

  const analysis = analyze(scenario, stdoutPath, tracePath);
  analysis.elapsed_ms = elapsed;
  analysis.exit_code = proc.status;
  fs.writeFileSync(resultPath, JSON.stringify(analysis, null, 2));

  teardownWorld();
  return analysis;
}

function analyze(scenario, stdoutPath, tracePath) {
  const traceEntries = fs.existsSync(tracePath)
    ? fs.readFileSync(tracePath, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const blockEvents = traceEntries.filter((e) => e.event === 'block');
  const approveEvents = traceEntries.filter((e) => e.event === 'approve');

  const stream = fs.existsSync(stdoutPath)
    ? fs.readFileSync(stdoutPath, 'utf-8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];

  const assistantTurns = stream
    .filter((o) => o.type === 'assistant' && o.message)
    .map((o) => {
      const parts = o.message.content ?? [];
      const texts = parts.filter((p) => p?.type === 'text').map((p) => p.text ?? '');
      return texts.join('\n');
    })
    .filter(Boolean);

  const result = stream.find((o) => o.type === 'result') ?? {};

  const expected = scenario.expected ?? {};
  const expectedAction = expected.decision ?? 'approve';

  let passed;
  if (expectedAction === 'block') {
    // 첫 assistant 턴 직후 block 이 최소 1회 발생하면 성공.
    passed = blockEvents.length >= 1;
  } else if (expectedAction === 'approve') {
    // block 이 0이어야 함.
    passed = blockEvents.length === 0 && approveEvents.length >= 1;
  } else {
    passed = false;
  }

  return {
    id: scenario.id,
    status: passed ? 'pass' : 'fail',
    expected: expectedAction,
    observed: {
      block_count: blockEvents.length,
      approve_count: approveEvents.length,
      assistant_turns: assistantTurns.length,
      first_assistant_preview: assistantTurns[0]?.slice(0, 120) ?? null,
      last_assistant_preview: assistantTurns.at(-1)?.slice(0, 120) ?? null,
      hook_elapsed_ms_per_call: traceEntries
        .filter((e) => e.elapsed_ms != null)
        .map((e) => e.elapsed_ms),
      total_cost_usd: result.total_cost_usd ?? null,
      num_turns: result.num_turns ?? null,
      duration_api_ms: result.duration_api_ms ?? null,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const file = loadScenarios();
  let targets;
  if (mode === '--all') {
    targets = file.scenarios;
  } else if (mode === '--smoke') {
    targets = file.scenarios.filter((s) => ['S3', 'S2'].includes(s.id));
  } else if (!mode) {
    console.error('Usage: runner.mjs <S1..S10> | --all | --smoke');
    process.exit(2);
  } else {
    targets = file.scenarios.filter((s) => args.includes(s.id));
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true });

  const results = [];
  for (const scenario of targets) {
    console.log(`\n=== ${scenario.id} (${scenario.rule ?? scenario.rule_multi?.join('+')}) ===`);
    const r = runScenario(scenario);
    console.log(JSON.stringify(r, null, 2));
    results.push(r);
  }

  const summary = {
    spike: 'mech-b-a1',
    run_at: new Date().toISOString(),
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };
  fs.writeFileSync(path.join(RUNS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nSummary: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped}`);
  console.log(`→ ${path.join(RUNS_DIR, 'summary.json')}`);
}

main();
