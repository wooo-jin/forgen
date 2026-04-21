/**
 * Invariant: state-gc prunes session-scoped files older than the retention
 * window and leaves aggregate jsonl logs / recent files untouched.
 *
 * Motivation (2026-04-21 audit): STATE_DIR accumulated 10,802 files across
 * 12 prefixes (checkpoint-, injection-cache-, modified-files-, etc.) with
 * no cleanup path. SessionStart hook scanned them linearly every session.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pruneState, countSessionScopedFiles } from '../src/core/state-gc.js';

let sandbox: string;
let stateDir: string;
let outcomesDir: string;

function writeFileAt(p: string, mtimeMs: number, content = '{}'): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  fs.utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
}

describe('state-gc pruneState', () => {
  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'forgen-gc-test-'));
    stateDir = path.join(sandbox, 'state');
    outcomesDir = path.join(stateDir, 'outcomes');
    fs.mkdirSync(outcomesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('7일보다 오래된 session-scoped 파일만 삭제한다', () => {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;
    const recent = now - 2 * 24 * 60 * 60 * 1000;

    writeFileAt(path.join(stateDir, 'checkpoint-old.json'), old);
    writeFileAt(path.join(stateDir, 'injection-cache-old.json'), old);
    writeFileAt(path.join(stateDir, 'checkpoint-recent.json'), recent);

    const report = pruneState({ stateDir, outcomesDir, now, dryRun: false });
    expect(report.pruned).toBe(2);
    expect(fs.existsSync(path.join(stateDir, 'checkpoint-recent.json'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'checkpoint-old.json'))).toBe(false);
  });

  it('aggregate jsonl 로그(hook-errors, match-eval-log 등)는 건드리지 않는다', () => {
    const now = Date.now();
    const old = now - 30 * 24 * 60 * 60 * 1000;

    writeFileAt(path.join(stateDir, 'hook-errors.jsonl'), old);
    writeFileAt(path.join(stateDir, 'hook-timing.jsonl'), old);
    writeFileAt(path.join(stateDir, 'match-eval-log.jsonl'), old);
    writeFileAt(path.join(stateDir, 'implicit-feedback.jsonl'), old);
    writeFileAt(path.join(stateDir, 'solution-quarantine.jsonl'), old);

    const report = pruneState({ stateDir, outcomesDir, now, dryRun: false });
    expect(report.pruned).toBe(0);
    // 전체 5개 파일 모두 보존
    for (const f of ['hook-errors', 'hook-timing', 'match-eval-log', 'implicit-feedback', 'solution-quarantine']) {
      expect(fs.existsSync(path.join(stateDir, `${f}.jsonl`))).toBe(true);
    }
  });

  it('outcomes/*.jsonl (session-per-file)은 retention 적용 대상', () => {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;
    const recent = now - 1 * 24 * 60 * 60 * 1000;

    writeFileAt(path.join(outcomesDir, 'session-old.jsonl'), old);
    writeFileAt(path.join(outcomesDir, 'session-recent.jsonl'), recent);

    const report = pruneState({ stateDir, outcomesDir, now, dryRun: false });
    expect(report.pruned).toBe(1);
    expect(fs.existsSync(path.join(outcomesDir, 'session-recent.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(outcomesDir, 'session-old.jsonl'))).toBe(false);
  });

  it('dry-run은 파일을 실제로 삭제하지 않는다 (default behavior)', () => {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;
    writeFileAt(path.join(stateDir, 'checkpoint-old.json'), old);

    const report = pruneState({ stateDir, outcomesDir, now });
    expect(report.dryRun).toBe(true);
    expect(report.pruned).toBe(1); // pruned count counted, but not deleted
    expect(fs.existsSync(path.join(stateDir, 'checkpoint-old.json'))).toBe(true);
  });

  it('session-scoped prefix가 아닌 파일은 건드리지 않는다', () => {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;

    writeFileAt(path.join(stateDir, 'agent-hashes.json'), old);
    writeFileAt(path.join(stateDir, 'context-guard.json'), old); // context- prefix included
    writeFileAt(path.join(stateDir, 'some-random-config.json'), old);

    const report = pruneState({ stateDir, outcomesDir, now, dryRun: false });
    // context- 파일은 prune. agent-hashes.json / some-random-config.json 은 보존
    expect(fs.existsSync(path.join(stateDir, 'agent-hashes.json'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'some-random-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'context-guard.json'))).toBe(false);
    expect(report.pruned).toBe(1);
  });

  it('countSessionScopedFiles는 삭제 없이 개수만 센다', () => {
    const now = Date.now();
    writeFileAt(path.join(stateDir, 'checkpoint-a.json'), now);
    writeFileAt(path.join(stateDir, 'injection-cache-b.json'), now);
    writeFileAt(path.join(stateDir, 'hook-errors.jsonl'), now);

    expect(countSessionScopedFiles(stateDir)).toBe(2);
  });

  it('bytesFreed는 실제 삭제된 파일 크기의 합', () => {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;
    writeFileAt(path.join(stateDir, 'checkpoint-x.json'), old, 'x'.repeat(100));
    writeFileAt(path.join(stateDir, 'checkpoint-y.json'), old, 'y'.repeat(250));

    const report = pruneState({ stateDir, outcomesDir, now, dryRun: false });
    expect(report.bytesFreed).toBe(350);
  });
});
