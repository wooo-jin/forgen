import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fixupSolutions } from '../src/engine/solution-fixup.js';
import { diagnoseFromRawContent } from '../src/engine/solution-quarantine.js';

const TEST_DIR = `/tmp/forgen-test-fixup-${process.pid}`;

const BUGGY_2026_04_10 = `---
name: 2026-04-10-fail-open-llm-enrichment
version: 1
status: verified
confidence: 0.80
type: pattern
scope: me
tags:
  - llm
  - fail-open
identifiers:
  - enrichSolutionContent
created: "2026-04-10"
updated: "2026-04-10"
supersedes: null
source: compound-manual
---

## Context
Body text here.
`;

const VALID = `---
name: ok
version: 1
status: verified
confidence: 0.5
type: pattern
scope: me
tags: []
identifiers: []
created: "2026-04-16"
updated: "2026-04-16"
supersedes: null
extractedBy: manual
evidence:
  injected: 10
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
---

body
`;

describe('fixupSolutions', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('dry-run reports what would change without modifying files', () => {
    const p = path.join(TEST_DIR, 'buggy.md');
    fs.writeFileSync(p, BUGGY_2026_04_10);
    const before = fs.readFileSync(p, 'utf-8');
    const result = fixupSolutions(TEST_DIR, { dryRun: true });
    expect(result.fixed).toBe(1);
    expect(result.scanned).toBe(1);
    expect(fs.readFileSync(p, 'utf-8')).toBe(before);
  });

  it('apply mode writes the repaired file', () => {
    const p = path.join(TEST_DIR, 'buggy.md');
    fs.writeFileSync(p, BUGGY_2026_04_10);
    const result = fixupSolutions(TEST_DIR, { dryRun: false });
    expect(result.fixed).toBe(1);
    const repaired = fs.readFileSync(p, 'utf-8');
    expect(diagnoseFromRawContent(repaired)).toEqual([]);
  });

  it('adds both extractedBy:auto and evidence block when both are missing', () => {
    const p = path.join(TEST_DIR, 'buggy.md');
    fs.writeFileSync(p, BUGGY_2026_04_10);
    fixupSolutions(TEST_DIR, { dryRun: false });
    const repaired = fs.readFileSync(p, 'utf-8');
    expect(repaired).toMatch(/extractedBy: auto/);
    expect(repaired).toMatch(/evidence:/);
    expect(repaired).toMatch(/injected: 0/);
  });

  it('preserves existing fields including source: compound-manual', () => {
    const p = path.join(TEST_DIR, 'buggy.md');
    fs.writeFileSync(p, BUGGY_2026_04_10);
    fixupSolutions(TEST_DIR, { dryRun: false });
    const repaired = fs.readFileSync(p, 'utf-8');
    expect(repaired).toMatch(/source: compound-manual/);
    expect(repaired).toMatch(/2026-04-10-fail-open-llm-enrichment/);
    expect(repaired).toMatch(/## Context\nBody text here\./);
  });

  it('leaves valid files untouched', () => {
    const p = path.join(TEST_DIR, 'valid.md');
    fs.writeFileSync(p, VALID);
    const before = fs.readFileSync(p, 'utf-8');
    const result = fixupSolutions(TEST_DIR, { dryRun: false });
    expect(result.untouched).toBe(1);
    expect(result.fixed).toBe(0);
    expect(fs.readFileSync(p, 'utf-8')).toBe(before);
  });

  it('marks files as unfixable when they have errors beyond extractedBy/evidence', () => {
    const p = path.join(TEST_DIR, 'unfixable.md');
    fs.writeFileSync(p, `---
name: bad
version: 1
status: INVALID_STATUS
confidence: 0.5
type: pattern
scope: me
tags: []
identifiers: []
created: "x"
updated: "x"
supersedes: null
---
body`);
    const result = fixupSolutions(TEST_DIR, { dryRun: false });
    expect(result.unfixable).toBe(1);
    expect(result.fixed).toBe(0);
    expect(result.reports[0].remaining_errors.some((e) => e.startsWith('status'))).toBe(true);
  });

  it('scans multiple files and reports aggregate counts', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'a.md'), BUGGY_2026_04_10);
    fs.writeFileSync(path.join(TEST_DIR, 'b.md'), VALID);
    fs.writeFileSync(path.join(TEST_DIR, 'c.md'), BUGGY_2026_04_10.replace('fail-open-llm-enrichment', 'another-pattern'));
    const result = fixupSolutions(TEST_DIR, { dryRun: false });
    expect(result.scanned).toBe(3);
    expect(result.fixed).toBe(2);
    expect(result.untouched).toBe(1);
  });
});
