/**
 * v0.4.1 `forgen init` starter-pack 프로비저닝.
 *
 * buyer-day1 격리 시뮬에서 발견: 신규 FORGEN_HOME 은 postinstall 경유가 아니라
 * starter-pack 0개 → "첫날 가치 0" 결함. initializeForgenHome() 이 런타임에
 * 동일 배포를 책임진다. 보수적: ≥5개 기존 솔루션 있으면 skip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-init-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { initializeForgenHome } = await import('../src/core/init-cli.js');

describe('initializeForgenHome — v0.4.1 starter pack', () => {
  const solutionsDir = path.join(TEST_HOME, '.forgen', 'me', 'solutions');

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('빈 홈에 starter-pack 을 복사한다', () => {
    const r = initializeForgenHome();
    expect(r.skipped).toBe(false);
    expect(r.solutionsInstalled).toBeGreaterThan(0);
    // 실제 파일 확인
    const files = fs.readdirSync(solutionsDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBe(r.solutionsInstalled);
    expect(files.some((f) => f.startsWith('starter-'))).toBe(true);
  });

  it('이미 5개 이상 솔루션이 있으면 기본 skip', () => {
    fs.mkdirSync(solutionsDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(solutionsDir, `user-${i}.md`), '---\ntitle: user\n---\n');
    }
    const r = initializeForgenHome();
    expect(r.skipped).toBe(true);
    expect(r.solutionsInstalled).toBe(0);
    expect(r.solutionsSkippedExisting).toBe(5);
  });

  it('--force 동등 옵션은 ≥5 상태에서도 starter 배포', () => {
    fs.mkdirSync(solutionsDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(solutionsDir, `user-${i}.md`), '---\ntitle: user\n---\n');
    }
    const r = initializeForgenHome({ force: true });
    expect(r.skipped).toBe(false);
    expect(r.solutionsInstalled).toBeGreaterThan(0);
  });

  it('기존 user-solution 은 보호 (중복 파일명 없으면 덮어쓰지 않음)', () => {
    fs.mkdirSync(solutionsDir, { recursive: true });
    const preserved = path.join(solutionsDir, 'my-work.md');
    fs.writeFileSync(preserved, 'my content');
    // 4개만 → skip 조건 (≥5) 미달 → 배포 진행
    const r = initializeForgenHome();
    expect(r.skipped).toBe(false);
    // preserved 파일 유지
    expect(fs.readFileSync(preserved, 'utf-8')).toBe('my content');
  });
});
