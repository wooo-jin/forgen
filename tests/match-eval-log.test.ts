import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/forgen-test-match-eval-log',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  logMatchDecision,
  readMatchEvalLog,
  MATCH_EVAL_LOG_ENV,
  MATCH_EVAL_LOG_SAMPLE_ENV,
  type MatchEvalLogRecord,
} from '../src/engine/match-eval-log.js';
import { MATCH_EVAL_LOG_PATH } from '../src/core/paths.js';

function expectedHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

describe('logMatchDecision', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env[MATCH_EVAL_LOG_ENV];
    delete process.env[MATCH_EVAL_LOG_SAMPLE_ENV];
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env[MATCH_EVAL_LOG_ENV];
    delete process.env[MATCH_EVAL_LOG_SAMPLE_ENV];
  });

  it('writes rawQueryHash + rawQueryLen (never rawQuery verbatim)', () => {
    const rawPrompt = '에러 핸들링 패턴';
    logMatchDecision({
      source: 'hook',
      rawQuery: rawPrompt,
      normalizedQuery: ['에러', 'error', 'handling'],
      candidates: [
        { name: 'starter-error-handling-patterns', relevance: 0.82, matchedTerms: ['error', 'handling'] },
      ],
      rankedTopN: ['starter-error-handling-patterns'],
    });

    const records = readMatchEvalLog();
    expect(records.length).toBe(1);
    const rec = records[0];
    expect(rec.source).toBe('hook');
    expect(rec.rawQueryHash).toBe(expectedHash(rawPrompt));
    expect(rec.rawQueryLen).toBe([...rawPrompt].length);
    // Ensure the raw prompt is NOT persisted in any form.
    expect(JSON.stringify(rec)).not.toContain(rawPrompt);
    expect(JSON.stringify(rec)).not.toContain('핸들링 패턴');
    expect(rec.normalizedQuery).toEqual(['에러', 'error', 'handling']);
    expect(rec.candidates).toHaveLength(1);
    expect(rec.candidates[0].name).toBe('starter-error-handling-patterns');
    expect(rec.candidates[0].relevance).toBeCloseTo(0.82);
    expect(rec.candidates[0].matchedTerms).toEqual(['error', 'handling']);
    expect(rec.rankedTopN).toEqual(['starter-error-handling-patterns']);
    expect(typeof rec.ts).toBe('string');
    expect(() => new Date(rec.ts).toISOString()).not.toThrow();
  });

  it('identical rawQuery produces identical hash (dedup signal works)', () => {
    logMatchDecision({ source: 'hook', rawQuery: 'same prompt', normalizedQuery: [], candidates: [], rankedTopN: [] });
    logMatchDecision({ source: 'mcp', rawQuery: 'same prompt', normalizedQuery: [], candidates: [], rankedTopN: [] });

    const records = readMatchEvalLog();
    expect(records.length).toBe(2);
    expect(records[0].rawQueryHash).toBe(records[1].rawQueryHash);
    // Different source, same prompt → same hash
    expect(records[0].source).toBe('hook');
    expect(records[1].source).toBe('mcp');
  });

  it('appends records across multiple calls in order', () => {
    logMatchDecision({ source: 'hook', rawQuery: 'q1', normalizedQuery: ['q1'], candidates: [], rankedTopN: [] });
    logMatchDecision({ source: 'mcp', rawQuery: 'q2', normalizedQuery: ['q2'], candidates: [], rankedTopN: [] });
    logMatchDecision({ source: 'hook', rawQuery: 'q3', normalizedQuery: ['q3'], candidates: [], rankedTopN: [] });

    const records = readMatchEvalLog();
    expect(records.length).toBe(3);
    expect(records.map(r => r.rawQueryHash)).toEqual([
      expectedHash('q1'),
      expectedHash('q2'),
      expectedHash('q3'),
    ]);
    expect(records.map(r => r.source)).toEqual(['hook', 'mcp', 'hook']);
  });

  it('writes to MATCH_EVAL_LOG_PATH under STATE_DIR', () => {
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(true);
    expect(MATCH_EVAL_LOG_PATH).toContain('state');
    expect(path.basename(MATCH_EVAL_LOG_PATH)).toBe('match-eval-log.jsonl');
    // Mode must be owner-only
    const mode = fs.statSync(MATCH_EVAL_LOG_PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('is disabled when FORGEN_MATCH_EVAL_LOG=off (writes nothing)', () => {
    process.env[MATCH_EVAL_LOG_ENV] = 'off';
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);
  });

  it('is disabled when FORGEN_MATCH_EVAL_LOG=0 (writes nothing)', () => {
    process.env[MATCH_EVAL_LOG_ENV] = '0';
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);
  });

  it('sample rate 0 writes nothing', () => {
    process.env[MATCH_EVAL_LOG_SAMPLE_ENV] = '0';
    for (let i = 0; i < 20; i++) {
      logMatchDecision({ source: 'hook', rawQuery: `q${i}`, normalizedQuery: [], candidates: [], rankedTopN: [] });
    }
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);
  });

  it('sample rate 1 writes every call', () => {
    process.env[MATCH_EVAL_LOG_SAMPLE_ENV] = '1';
    for (let i = 0; i < 10; i++) {
      logMatchDecision({ source: 'hook', rawQuery: `q${i}`, normalizedQuery: [], candidates: [], rankedTopN: [] });
    }
    expect(readMatchEvalLog().length).toBe(10);
  });

  it('invalid sample rate fails closed (writes nothing)', () => {
    // fail-closed for privacy: if operator mistypes the value, default to
    // skipping rather than to full-volume logging.
    process.env[MATCH_EVAL_LOG_SAMPLE_ENV] = 'abc';
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);

    process.env[MATCH_EVAL_LOG_SAMPLE_ENV] = '-0.5';
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);

    process.env[MATCH_EVAL_LOG_SAMPLE_ENV] = '2';
    logMatchDecision({ source: 'hook', rawQuery: 'x', normalizedQuery: [], candidates: [], rankedTopN: [] });
    expect(fs.existsSync(MATCH_EVAL_LOG_PATH)).toBe(false);
  });

  it('fail-open: swallows errors when input is malformed', () => {
    expect(() => {
      logMatchDecision({
        source: 'hook',
        // @ts-expect-error — intentional bad shape to verify fail-open
        rawQuery: { toString() { throw new Error('boom'); } },
        normalizedQuery: [],
        candidates: [],
        rankedTopN: [],
      });
    }).not.toThrow();
  });

  it('truncates long normalizedQuery and candidates to cap record size', () => {
    const hugeQuery = Array.from({ length: 500 }, (_, i) => `term-${i}`);
    const hugeCandidates = Array.from({ length: 500 }, (_, i) => ({
      name: `sol-${i}`,
      relevance: 0.5,
      matchedTerms: Array.from({ length: 50 }, (_, j) => `t${i}-${j}`),
    }));
    logMatchDecision({
      source: 'hook',
      rawQuery: 'giant',
      normalizedQuery: hugeQuery,
      candidates: hugeCandidates,
      rankedTopN: hugeCandidates.slice(0, 5).map(c => c.name),
    });

    const records = readMatchEvalLog();
    expect(records.length).toBe(1);
    expect(records[0].candidates.length).toBeLessThanOrEqual(5);
    expect(records[0].normalizedQuery.length).toBeLessThanOrEqual(64);
    expect(records[0].rankedTopN.length).toBeLessThanOrEqual(5);
    // Each candidate's matchedTerms bounded to 16
    for (const c of records[0].candidates) {
      expect(c.matchedTerms.length).toBeLessThanOrEqual(16);
    }
  });

  it('refuses to follow a symlink at the log path', () => {
    // Create a symlink at MATCH_EVAL_LOG_PATH pointing to a decoy file.
    // The logger must refuse to append through it (O_NOFOLLOW).
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true, mode: 0o700 });
    const decoyPath = path.join(TEST_HOME, 'decoy-target.txt');
    fs.writeFileSync(decoyPath, 'decoy-contents\n');
    fs.symlinkSync(decoyPath, MATCH_EVAL_LOG_PATH);

    // Attempt to log. The logger should fail gracefully (no write, no throw).
    expect(() => {
      logMatchDecision({ source: 'hook', rawQuery: 'attack', normalizedQuery: [], candidates: [], rankedTopN: [] });
    }).not.toThrow();

    // Decoy file must be unchanged — the symlink was not followed.
    expect(fs.readFileSync(decoyPath, 'utf-8')).toBe('decoy-contents\n');
  });
});

describe('readMatchEvalLog', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('returns empty array when the log file does not exist', () => {
    expect(readMatchEvalLog()).toEqual([]);
  });

  it('skips malformed lines but parses valid ones', () => {
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true });
    const valid: MatchEvalLogRecord = {
      source: 'hook',
      rawQueryHash: expectedHash('good'),
      rawQueryLen: 4,
      normalizedQuery: ['good'],
      candidates: [],
      rankedTopN: [],
      ts: new Date().toISOString(),
    };
    fs.writeFileSync(
      MATCH_EVAL_LOG_PATH,
      `${JSON.stringify(valid)}\nnot-json-at-all\n${JSON.stringify({ ...valid, rawQueryHash: expectedHash('also-good') })}\n`,
    );
    const records = readMatchEvalLog();
    expect(records.length).toBe(2);
    expect(records.map(r => r.rawQueryHash)).toEqual([expectedHash('good'), expectedHash('also-good')]);
  });

  it('skips records with invalid candidate shape', () => {
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true });
    // Candidate with non-string name — must be rejected
    const bad = {
      source: 'hook',
      rawQueryHash: expectedHash('bad'),
      rawQueryLen: 3,
      normalizedQuery: [],
      candidates: [{ name: 42, relevance: 0.5, matchedTerms: ['x'] }],
      rankedTopN: [],
      ts: new Date().toISOString(),
    };
    fs.writeFileSync(MATCH_EVAL_LOG_PATH, `${JSON.stringify(bad)}\n`);
    expect(readMatchEvalLog()).toEqual([]);
  });

  it('refuses to read a symlinked log path', () => {
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true });
    const target = path.join(TEST_HOME, 'elsewhere.jsonl');
    fs.writeFileSync(target, `${JSON.stringify({
      source: 'hook',
      rawQueryHash: 'x',
      rawQueryLen: 0,
      normalizedQuery: [],
      candidates: [],
      rankedTopN: [],
      ts: new Date().toISOString(),
    })}\n`);
    fs.symlinkSync(target, MATCH_EVAL_LOG_PATH);
    expect(readMatchEvalLog()).toEqual([]);
  });
});

describe('logMatchDecision rotation (2026-04-21)', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env[MATCH_EVAL_LOG_ENV];
    delete process.env[MATCH_EVAL_LOG_SAMPLE_ENV];
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    delete process.env[MATCH_EVAL_LOG_ENV];
    delete process.env[MATCH_EVAL_LOG_SAMPLE_ENV];
  });

  it('파일이 10 MB 임계를 넘으면 .jsonl.1로 회전하고 새 파일에 기록', () => {
    // Seed the log at ≥10MB so the next write rotates.
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true });
    const bulk = 'x'.repeat(11 * 1024 * 1024);
    fs.writeFileSync(MATCH_EVAL_LOG_PATH, bulk);
    const originalSize = fs.statSync(MATCH_EVAL_LOG_PATH).size;
    expect(originalSize).toBeGreaterThanOrEqual(10 * 1024 * 1024);

    logMatchDecision({
      source: 'hook',
      rawQuery: 'trigger rotation',
      normalizedQuery: ['trigger'],
      candidates: [],
      rankedTopN: [],
    });

    // .jsonl.1 should now hold the previous content (size ≥ 10MB),
    // and .jsonl should be a fresh file with the single new record.
    const rotatedPath = `${MATCH_EVAL_LOG_PATH}.1`;
    expect(fs.existsSync(rotatedPath)).toBe(true);
    expect(fs.statSync(rotatedPath).size).toBe(originalSize);

    const freshLines = fs.readFileSync(MATCH_EVAL_LOG_PATH, 'utf-8').trim().split('\n');
    expect(freshLines).toHaveLength(1);
    const rec = JSON.parse(freshLines[0]) as MatchEvalLogRecord;
    expect(rec.rawQueryHash).toBe(expectedHash('trigger rotation'));
  });

  it('파일이 10 MB 미만이면 회전하지 않는다', () => {
    logMatchDecision({
      source: 'hook',
      rawQuery: 'no-rotate',
      normalizedQuery: ['no'],
      candidates: [],
      rankedTopN: [],
    });
    logMatchDecision({
      source: 'hook',
      rawQuery: 'no-rotate-2',
      normalizedQuery: ['no'],
      candidates: [],
      rankedTopN: [],
    });
    expect(fs.existsSync(`${MATCH_EVAL_LOG_PATH}.1`)).toBe(false);
    expect(readMatchEvalLog()).toHaveLength(2);
  });

  it('이전 회전본(.jsonl.1)이 있어도 다음 회전은 덮어쓴다 (1세대 유지)', () => {
    fs.mkdirSync(path.dirname(MATCH_EVAL_LOG_PATH), { recursive: true });
    // Pre-existing .jsonl.1 sentinel
    fs.writeFileSync(`${MATCH_EVAL_LOG_PATH}.1`, 'OLD_GENERATION');
    // Current log over threshold
    fs.writeFileSync(MATCH_EVAL_LOG_PATH, 'y'.repeat(11 * 1024 * 1024));

    logMatchDecision({
      source: 'hook',
      rawQuery: 'overwrite rotation',
      normalizedQuery: [],
      candidates: [],
      rankedTopN: [],
    });

    // .jsonl.1 is clobbered (no longer "OLD_GENERATION")
    const rotated = fs.readFileSync(`${MATCH_EVAL_LOG_PATH}.1`, 'utf-8');
    expect(rotated).not.toContain('OLD_GENERATION');
    expect(rotated.length).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  });
});
