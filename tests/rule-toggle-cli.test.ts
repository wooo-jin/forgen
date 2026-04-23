/**
 * R7-U2 tests — suppress-rule / activate-rule CLI handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import type { Rule } from '../src/store/types.js';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-rule-toggle-${process.pid}`,
}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { handleSuppressRule, handleActivateRule } = await import('../src/engine/rule-toggle-cli.js');
const { createRule, saveRule, loadRule } = await import('../src/store/rule-store.js');

function softRule(overrides: Partial<Rule> = {}): Rule {
  return {
    rule_id: 'r-test-1',
    category: 'quality',
    scope: 'me',
    trigger: 't',
    policy: 'use async/await',
    strength: 'default',
    source: 'explicit_correction',
    status: 'active',
    evidence_refs: [],
    render_key: 'k',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function silenceConsole(): { restore: () => void; logs: string[]; errs: string[] } {
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (msg: unknown) => { logs.push(String(msg)); };
  console.error = (msg: unknown) => { errs.push(String(msg)); };
  return {
    logs, errs,
    restore: () => { console.log = origLog; console.error = origErr; },
  };
}

describe('handleSuppressRule', () => {
  beforeEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));
  afterEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));

  it('active rule → suppressed', async () => {
    const r = softRule({ rule_id: 'abcd1234' });
    saveRule(r);
    const c = silenceConsole();
    try {
      await handleSuppressRule(['abcd1234']);
    } finally { c.restore(); }
    expect(loadRule('abcd1234')?.status).toBe('suppressed');
  });

  it('prefix match 지원', async () => {
    const r = softRule({ rule_id: 'abcd1234-xyz' });
    saveRule(r);
    const c = silenceConsole();
    try {
      await handleSuppressRule(['abcd']);
    } finally { c.restore(); }
    expect(loadRule('abcd1234-xyz')?.status).toBe('suppressed');
  });

  it('hard rule → refuse, exit 1', async () => {
    const r = softRule({ rule_id: 'hard-rule', strength: 'hard' });
    saveRule(r);
    const c = silenceConsole();
    const origExit = process.exit;
    let exited: number | undefined;
    process.exit = ((code?: number) => { exited = code; throw new Error('exit'); }) as typeof process.exit;
    try {
      await expect(handleSuppressRule(['hard-rule'])).rejects.toThrow('exit');
      expect(exited).toBe(1);
    } finally { process.exit = origExit; c.restore(); }
    expect(loadRule('hard-rule')?.status).toBe('active');
    expect(c.errs.some((e) => /Refusing to suppress hard rule/.test(e))).toBe(true);
  });

  it('ambiguous prefix → exit 1', async () => {
    saveRule(softRule({ rule_id: 'abcd1111' }));
    saveRule(softRule({ rule_id: 'abcd2222' }));
    const c = silenceConsole();
    const origExit = process.exit;
    let exited: number | undefined;
    process.exit = ((code?: number) => { exited = code; throw new Error('exit'); }) as typeof process.exit;
    try {
      await expect(handleSuppressRule(['abcd'])).rejects.toThrow('exit');
      expect(exited).toBe(1);
    } finally { process.exit = origExit; c.restore(); }
    expect(c.errs.some((e) => /Ambiguous/.test(e))).toBe(true);
  });

  it('not found → exit 1', async () => {
    const c = silenceConsole();
    const origExit = process.exit;
    let exited: number | undefined;
    process.exit = ((code?: number) => { exited = code; throw new Error('exit'); }) as typeof process.exit;
    try {
      await expect(handleSuppressRule(['nonexistent'])).rejects.toThrow('exit');
      expect(exited).toBe(1);
    } finally { process.exit = origExit; c.restore(); }
  });

  it('already suppressed → no-op, success', async () => {
    saveRule(softRule({ rule_id: 'already-sup', status: 'suppressed' }));
    const c = silenceConsole();
    try {
      await handleSuppressRule(['already-sup']);
    } finally { c.restore(); }
    expect(loadRule('already-sup')?.status).toBe('suppressed');
    expect(c.logs.some((l) => /already suppressed/.test(l))).toBe(true);
  });
});

describe('handleActivateRule', () => {
  beforeEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));
  afterEach(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));

  it('suppressed → active', async () => {
    saveRule(softRule({ rule_id: 'to-activate', status: 'suppressed' }));
    const c = silenceConsole();
    try {
      await handleActivateRule(['to-activate']);
    } finally { c.restore(); }
    expect(loadRule('to-activate')?.status).toBe('active');
  });

  it('removed rule → refuse', async () => {
    saveRule(softRule({ rule_id: 'removed-r', status: 'removed' }));
    const c = silenceConsole();
    const origExit = process.exit;
    let exited: number | undefined;
    process.exit = ((code?: number) => { exited = code; throw new Error('exit'); }) as typeof process.exit;
    try {
      await expect(handleActivateRule(['removed-r'])).rejects.toThrow('exit');
      expect(exited).toBe(1);
    } finally { process.exit = origExit; c.restore(); }
    expect(loadRule('removed-r')?.status).toBe('removed');
  });
});
