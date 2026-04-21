/**
 * Invariant: loadProfile rejects legacy-shaped JSON and returns null
 * rather than typing it as v1 Profile.
 *
 * Audit finding #6 (2026-04-21): prior loadProfile used
 * safeReadJSON<Profile>() which type-asserted the on-disk blob without
 * checking model_version. Legacy JSON (missing `axes`, `base_packs`,
 * `trust_preferences`) flowed through to session composition and broke
 * at `profile.trust_preferences.desired_policy` lookup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: `/tmp/forgen-test-profile-legacy-${process.pid}`,
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const { loadProfile, loadProfileRaw, profileExists, isV1Profile, createProfile, saveProfile } =
  await import('../src/store/profile-store.js');
const { ME_DIR, FORGE_PROFILE } = await import('../src/core/paths.js');

describe('loadProfile legacy-shape guard', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(ME_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('파일 없음 → null', () => {
    expect(loadProfile()).toBeNull();
    expect(profileExists()).toBe(false);
  });

  it('legacy shape (no model_version) → loadProfile은 null을 반환 (cutover 재유도)', () => {
    const legacy = { userId: 'old', quality: 'strict', version: '1.0' };
    fs.writeFileSync(FORGE_PROFILE, JSON.stringify(legacy));

    expect(profileExists()).toBe(true); // 파일은 있음
    expect(loadProfile()).toBeNull();   // 하지만 v1 profile로 인식 안 됨
    expect(loadProfileRaw()).toEqual(legacy); // raw 접근은 여전히 가능 (migration 용)
  });

  it('legacy shape (model_version 1.x) → loadProfile은 null', () => {
    const legacy = { model_version: '1.5', axes: {}, base_packs: {} };
    fs.writeFileSync(FORGE_PROFILE, JSON.stringify(legacy));
    expect(loadProfile()).toBeNull();
  });

  it('v1 profile (model_version 2.x) → 정상 반환', () => {
    const profile = createProfile(
      'user1',
      '보수형',
      '확인 우선형',
      '가드레일 우선',
      'onboarding',
    );
    saveProfile(profile);

    const loaded = loadProfile();
    expect(loaded).not.toBeNull();
    expect(loaded!.model_version).toMatch(/^2\./);
    expect(loaded!.trust_preferences.desired_policy).toBe('가드레일 우선');
  });

  it('isV1Profile은 부분적/손상된 객체를 거부한다', () => {
    expect(isV1Profile(null)).toBe(false);
    expect(isV1Profile(undefined)).toBe(false);
    expect(isV1Profile('string')).toBe(false);
    expect(isV1Profile([])).toBe(false);
    expect(isV1Profile({})).toBe(false);
    expect(isV1Profile({ model_version: '1.9' })).toBe(false);
    expect(isV1Profile({ model_version: '2.0' })).toBe(true);
    expect(isV1Profile({ model_version: '2.1' })).toBe(true);
  });
});
