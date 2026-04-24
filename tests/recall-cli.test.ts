/**
 * H5: forgen recall CLI — 최근 surface 된 솔루션 조회.
 *
 * v0.4.0 에서 recall 8,000+ 건이 0 건 노출이었던 regression 에 대응하는 사용자
 * 직접 확인 채널. implicit-feedback.jsonl 의 recommendation_surfaced 만 필터.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-recall-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { loadRecentRecalls, handleRecall } = await import('../src/core/recall-cli.js');

describe('forgen recall — H5', () => {
  const feedbackPath = path.join(TEST_HOME, '.forgen', 'state', 'implicit-feedback.jsonl');
  const solutionsDir = path.join(TEST_HOME, '.forgen', 'me', 'solutions');

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
    fs.mkdirSync(solutionsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  function writeFeedback(entries: unknown[]) {
    fs.writeFileSync(feedbackPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }

  it('loadRecentRecalls returns empty when no data', async () => {
    expect(loadRecentRecalls()).toEqual([]);
  });

  it('loadRecentRecalls filters recommendation_surfaced and sorts desc by at', async () => {
    writeFeedback([
      { type: 'recommendation_surfaced', category: 'positive', at: '2026-04-23T10:00:00Z', sessionId: 'S1', solution: 'pattern-a', match_score: 0.45 },
      { type: 'drift_critical', category: 'drift', at: '2026-04-23T11:00:00Z', sessionId: 'S1' },
      { type: 'recommendation_surfaced', category: 'positive', at: '2026-04-23T12:00:00Z', sessionId: 'S2', solution: 'pattern-b', match_score: 0.72 },
    ]);
    const recalls = loadRecentRecalls();
    expect(recalls).toHaveLength(2);
    expect(recalls[0].solution).toBe('pattern-b');
    expect(recalls[1].solution).toBe('pattern-a');
  });

  it('loadRecentRecalls respects limit', async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      type: 'recommendation_surfaced',
      category: 'positive',
      at: `2026-04-23T${String(i).padStart(2, '0')}:00:00Z`,
      sessionId: 'S1',
      solution: `sol-${i}`,
    }));
    writeFeedback(entries);
    expect(loadRecentRecalls(5)).toHaveLength(5);
  });

  it('handleRecall prints "(no recent recalls)" when empty', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    await handleRecall([]);
    spy.mockRestore();
    expect(logs.join('\n')).toContain('no recent recalls');
  });

  it('handleRecall --json emits parseable JSON with preview when --show', async () => {
    writeFeedback([
      { type: 'recommendation_surfaced', category: 'positive', at: '2026-04-23T10:00:00Z', sessionId: 'S1', solution: 'my-pattern', match_score: 0.42 },
    ]);
    fs.writeFileSync(path.join(solutionsDir, 'my-pattern.md'),
      '---\ntitle: demo\n---\n# body line 1\nbody line 2\nbody line 3');

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    await handleRecall(['--json', '--show']);
    spy.mockRestore();
    const data = JSON.parse(logs.join(''));
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].solution).toBe('my-pattern');
    expect(data[0].preview).toContain('body line 1');
  });

  it('handleRecall text output includes solution names and scores', async () => {
    writeFeedback([
      { type: 'recommendation_surfaced', category: 'positive', at: '2026-04-23T10:00:00Z', sessionId: 'S1', solution: 'alpha', match_score: 0.5 },
      { type: 'recommendation_surfaced', category: 'positive', at: '2026-04-23T11:00:00Z', sessionId: 'S1', solution: 'beta' },
    ]);
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    await handleRecall([]);
    spy.mockRestore();
    const combined = logs.join('\n');
    expect(combined).toContain('alpha');
    expect(combined).toContain('beta');
    expect(combined).toContain('@0.50');
  });
});
