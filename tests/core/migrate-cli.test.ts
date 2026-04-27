/**
 * handleMigrate — evidence-host dispatch 검증
 *
 * migrateEvidenceHost 자체의 동작은 tests/store/migrate-evidence-host.test.ts 에서 검증.
 * 여기서는 handleMigrate 가 evidence-host subcommand 를 올바르게 dispatch 하고
 * 출력 형식이 스펙과 일치하는지만 확인한다.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// migrateEvidenceHost 를 mock 하여 CLI 분기 로직만 격리 테스트
vi.mock('../../src/core/migrate-evidence-host.js', () => ({
  migrateEvidenceHost: vi.fn(),
}));

// implicit-feedback-store 도 mock (다른 branch 가 실제 fs 접근 안 하도록)
vi.mock('../../src/store/implicit-feedback-store.js', () => ({
  migrateImplicitFeedbackLog: vi.fn(() => ({ migrated: 0, dropped: 0 })),
}));

import { migrateEvidenceHost } from '../../src/core/migrate-evidence-host.js';
import { handleMigrate } from '../../src/core/migrate-cli.js';

const mockMigrate = vi.mocked(migrateEvidenceHost);

afterEach(() => {
  vi.clearAllMocks();
});

describe('handleMigrate evidence-host', () => {
  it('기본 호출 — defaultHost=claude, dryRun=false 로 dispatch', async () => {
    mockMigrate.mockReturnValue({ migrated: 3, skipped: 2, total: 5 });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

    await handleMigrate(['evidence-host']);

    expect(mockMigrate).toHaveBeenCalledOnce();
    expect(mockMigrate).toHaveBeenCalledWith({ defaultHost: 'claude', dryRun: false });
    expect(logs.some(l => l.includes('migrated: 3') && l.includes('skipped: 2') && l.includes('total: 5'))).toBe(true);

    vi.restoreAllMocks();
  });

  it('--dry-run 플래그 전달 시 출력에 (dry-run) 포함', async () => {
    mockMigrate.mockReturnValue({ migrated: 2, skipped: 0, total: 2 });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

    await handleMigrate(['evidence-host', '--dry-run']);

    expect(mockMigrate).toHaveBeenCalledWith({ defaultHost: 'claude', dryRun: true });
    expect(logs.some(l => l.includes('(dry-run)'))).toBe(true);

    vi.restoreAllMocks();
  });

  it('--default-host codex 를 올바르게 전달', async () => {
    mockMigrate.mockReturnValue({ migrated: 1, skipped: 4, total: 5 });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleMigrate(['evidence-host', '--default-host', 'codex']);

    expect(mockMigrate).toHaveBeenCalledWith({ defaultHost: 'codex', dryRun: false });

    vi.restoreAllMocks();
  });

  it('잘못된 --default-host 값은 process.exit(1)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error('exit'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleMigrate(['evidence-host', '--default-host', 'unknown'])).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.restoreAllMocks();
  });
});
