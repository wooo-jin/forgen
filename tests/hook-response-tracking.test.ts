/**
 * Tests for failOpenWithTracking in hook-response.ts
 *
 * Uses vi.mock('node:os') to redirect homedir to a sandboxed TEST_HOME so
 * the tracking log never touches real ~/.forgen/state. Without this, every
 * `npm test` run pollutes the contributor's production hook-errors.jsonl
 * (149+ "test-hook"/"hook-with-special/chars"/"" entries were observed in
 * the field — see 2026-04-21 data audit).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-hook-response-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { failOpenWithTracking, approve, deny, ask } = await import(
  '../src/hooks/shared/hook-response.js'
);

describe('hook-response functions', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('failOpenWithTracking returns continue: true JSON', () => {
    const result = JSON.parse(failOpenWithTracking('test-hook'));
    expect(result.continue).toBe(true);
  });

  it('failOpenWithTracking does not throw even with invalid inputs', () => {
    expect(() => failOpenWithTracking('')).not.toThrow();
    expect(() => failOpenWithTracking('hook-with-special/chars')).not.toThrow();
  });

  it('failOpenWithTracking writes tracking entries under the sandbox, never real $HOME', () => {
    failOpenWithTracking('sandboxed-hook');
    const sandboxLog = path.join(TEST_HOME, '.forgen', 'state', 'hook-errors.jsonl');
    expect(fs.existsSync(sandboxLog)).toBe(true);
    const lines = fs.readFileSync(sandboxLog, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('sandboxed-hook');
    expect(typeof entry.at).toBe('number');

    // Belt-and-suspenders: the sandbox path must not equal the real home.
    expect(sandboxLog.startsWith('/tmp/')).toBe(true);
  });

  it('approve returns continue: true', () => {
    const result = JSON.parse(approve());
    expect(result.continue).toBe(true);
  });

  it('deny returns continue: false with deny decision', () => {
    const result = JSON.parse(deny('test reason'));
    expect(result.continue).toBe(false);
    expect(result.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput.permissionDecisionReason).toBe('test reason');
  });

  it('ask returns continue: true with ask decision', () => {
    const result = JSON.parse(ask('confirm reason'));
    expect(result.continue).toBe(true);
    expect(result.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});
