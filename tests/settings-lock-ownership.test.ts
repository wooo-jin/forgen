/**
 * Invariant: settings-lock has ownership semantics and refuses to
 * forcibly overwrite a live holder.
 *
 * Audit finding #1 (2026-04-21): prior `acquireLock` unconditionally
 * overwrote the lock PID at timeout regardless of whether the prior
 * holder was alive, and `releaseLock` deleted the lock without checking
 * ownership, so concurrent forgen processes could cascade-release each
 * other.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-settings-lock-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { acquireLock, releaseLock, SettingsLockError } = await import(
  '../src/core/settings-lock.js'
);
const { CLAUDE_DIR } = await import('../src/core/paths.js');

const SETTINGS_LOCK_PATH = path.join(CLAUDE_DIR, 'settings.json.lock');

describe('settings-lock ownership + live-holder defense', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('락이 비어 있을 때 acquireLock은 내 PID를 기록한다', () => {
    acquireLock();
    const written = fs.readFileSync(SETTINGS_LOCK_PATH, 'utf-8').trim();
    expect(parseInt(written, 10)).toBe(process.pid);
    releaseLock();
  });

  it('releaseLock은 내 소유일 때만 지운다 (다른 PID 보존)', () => {
    const fakePid = 99999;
    fs.writeFileSync(SETTINGS_LOCK_PATH, String(fakePid));
    // 내 PID 아니니 지우면 안 됨
    releaseLock();
    expect(fs.existsSync(SETTINGS_LOCK_PATH)).toBe(true);
    const preserved = fs.readFileSync(SETTINGS_LOCK_PATH, 'utf-8').trim();
    expect(preserved).toBe(String(fakePid));
  });

  it('releaseLock은 소유자일 때 정상 삭제', () => {
    acquireLock();
    expect(fs.existsSync(SETTINGS_LOCK_PATH)).toBe(true);
    releaseLock();
    expect(fs.existsSync(SETTINGS_LOCK_PATH)).toBe(false);
  });

  it('live holder가 락을 가지고 있으면 acquireLock은 throw', () => {
    // 내 PID (현 프로세스)로 락을 선점 — live holder 시뮬레이션
    fs.writeFileSync(SETTINGS_LOCK_PATH, String(process.pid));

    expect(() => acquireLock()).toThrow();
    try {
      acquireLock();
    } catch (e) {
      expect(e).toBeInstanceOf(SettingsLockError);
      expect((e as Error).message).toMatch(/actively writing/);
    }

    // 원래 PID는 보존
    expect(fs.readFileSync(SETTINGS_LOCK_PATH, 'utf-8').trim()).toBe(String(process.pid));
  }, 10000);

  it('dead holder(존재하지 않는 PID) 락은 stale로 회수된다', () => {
    // 사용되지 않는 높은 PID (거의 확실히 존재하지 않음)
    const deadPid = 2147483; // 일반 ≪ max, 살아있을 확률 매우 낮음
    fs.writeFileSync(SETTINGS_LOCK_PATH, String(deadPid));

    acquireLock();
    // stale 회수 후 내 PID로 갱신됨
    expect(fs.readFileSync(SETTINGS_LOCK_PATH, 'utf-8').trim()).toBe(String(process.pid));
    releaseLock();
  }, 10000);
});
