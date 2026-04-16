import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-candidate-exploration-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { incrementEvidence } = await import('../src/engine/solution-writer.js');
const { parseFrontmatterOnly } = await import('../src/engine/solution-format.js');
const { ME_SOLUTIONS } = await import('../src/core/paths.js');

function writeSolution(name: string, status: 'candidate' | 'verified', injected: number): string {
  fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
  const fm = {
    name,
    version: 1,
    status,
    confidence: 0.6,
    type: 'pattern',
    scope: 'me',
    tags: ['test'],
    identifiers: [] as string[],
    created: '2026-04-16',
    updated: '2026-04-16',
    supersedes: null,
    extractedBy: 'auto',
    evidence: { injected, reflected: 0, negative: 0, sessions: 0, reExtracted: 0 },
  };
  const p = path.join(ME_SOLUTIONS, `${name}.md`);
  fs.writeFileSync(p, `---\n${yaml.dump(fm)}---\n\nbody\n`);
  return p;
}

function readStatus(filePath: string): { status: string; injected: number } {
  const fm = parseFrontmatterOnly(fs.readFileSync(filePath, 'utf-8'));
  if (!fm) throw new Error('invalid frontmatter');
  return { status: fm.status, injected: fm.evidence.injected };
}

describe('candidate promotion via incrementEvidence', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('leaves verified solutions alone', () => {
    const p = writeSolution('mature', 'verified', 100);
    incrementEvidence('mature', 'injected');
    expect(readStatus(p)).toEqual({ status: 'verified', injected: 101 });
  });

  it('keeps candidate status until injected reaches 5', () => {
    const p = writeSolution('fresh', 'candidate', 3);
    incrementEvidence('fresh', 'injected'); // 4
    expect(readStatus(p)).toEqual({ status: 'candidate', injected: 4 });
  });

  it('promotes candidate to verified on the 5th injection', () => {
    const p = writeSolution('fresh', 'candidate', 4);
    incrementEvidence('fresh', 'injected'); // 5
    expect(readStatus(p)).toEqual({ status: 'verified', injected: 5 });
  });

  it('does not regress status if already promoted', () => {
    const p = writeSolution('fresh', 'candidate', 4);
    incrementEvidence('fresh', 'injected'); // → verified
    incrementEvidence('fresh', 'injected'); // stays verified
    expect(readStatus(p)).toEqual({ status: 'verified', injected: 6 });
  });

  it('non-injected increments do not change candidate status', () => {
    const p = writeSolution('fresh', 'candidate', 10);
    incrementEvidence('fresh', 'reflected');
    expect(readStatus(p)).toMatchObject({ status: 'candidate' });
  });
});
