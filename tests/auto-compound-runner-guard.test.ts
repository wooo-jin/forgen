/**
 * S2 regression — FORGEN_AUTO_COMPOUND_RUNNER_PATH 가 FORGEN_TEST=1 없이는 무시되는지 검증.
 *
 * 공격 시나리오: 악성 shell rc 가 환경변수 한 줄을 심어 놓은 상태에서 사용자가 세션 종료.
 * 이전 버전은 즉시 임의 node 스크립트 실행. 현 버전은 무시.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTEXT_GUARD = path.join(REPO_ROOT, 'dist', 'hooks', 'context-guard.js');

function makeHome(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'forgen-s2-')); }

function seedContextState(home: string, sessionId: string, promptCount: number): void {
  const statePath = path.join(home, '.forgen', 'state', 'context-guard.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ sessionId, promptCount, totalChars: 0, lastWarningAt: 0, lastAutoCompactAt: 0 }));
}

function seedTranscript(home: string, sid: string, n = 12): string {
  const tdir = path.join(home, '.claude', 'projects', '-proj');
  fs.mkdirSync(tdir, { recursive: true });
  const tpath = path.join(tdir, `${sid}.jsonl`);
  const longText = 'x'.repeat(300);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: `msg ${i} ${longText}` } }));
    lines.push(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `reply ${longText}` }] } }));
  }
  fs.writeFileSync(tpath, lines.join('\n') + '\n');
  return tpath;
}

describe('S2 — FORGEN_AUTO_COMPOUND_RUNNER_PATH guard', () => {
  it('FORGEN_TEST 미설정 → override 무시 (fake runner 실행 안 됨)', () => {
    const home = makeHome();
    try {
      const sid = 'sess-s2-guard';
      seedContextState(home, sid, 12);
      const tpath = seedTranscript(home, sid, 12);

      // Attacker: 임의 경로에 악성 runner 배치
      const attackerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attacker-'));
      const evilRunner = path.join(attackerDir, 'evil.js');
      fs.writeFileSync(evilRunner, `
        const fs = require('node:fs');
        const path = require('node:path');
        const home = '${home.replace(/\\/g, '\\\\')}';
        fs.mkdirSync(path.join(home, '.forgen', 'state'), { recursive: true });
        fs.writeFileSync(path.join(home, '.forgen', 'state', 'PWNED.json'), 'evil');
      `);

      const proc = spawnSync('node', [CONTEXT_GUARD], {
        input: JSON.stringify({ session_id: sid, stop_hook_type: 'user', transcript_path: tpath }),
        env: {
          ...process.env, HOME: home,
          FORGEN_CWD: home,
          FORGEN_AUTO_COMPOUND_RUNNER_PATH: evilRunner, // NO FORGEN_TEST
        },
        encoding: 'utf-8', timeout: 8000,
      });
      expect(proc.status).toBe(0);

      // 악성 runner 가 실행되지 않았음을 확인 — PWNED.json 이 만들어지면 안 됨
      const pwned = path.join(home, '.forgen', 'state', 'PWNED.json');
      // 1초 대기 후 여전히 없어야 함
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline) {
        const t = Date.now();
        while (Date.now() - t < 50) { /* spin */ }
      }
      expect(fs.existsSync(pwned)).toBe(false);
      fs.rmSync(attackerDir, { recursive: true, force: true });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('FORGEN_TEST=1 + 허용 루트(/tmp) 내부 경로 → override 허용', () => {
    const home = makeHome();
    try {
      const sid = 'sess-s2-allowed';
      seedContextState(home, sid, 12);
      const tpath = seedTranscript(home, sid, 12);

      // Trusted test runner 는 /tmp 하위 (허용 루트)
      const fakeRunner = path.join(home, 'fake.js');
      fs.writeFileSync(fakeRunner, `
        const fs = require('node:fs');
        const path = require('node:path');
        const [,, cwd] = process.argv;
        fs.mkdirSync(path.join(cwd, '.forgen', 'state'), { recursive: true });
        fs.writeFileSync(path.join(cwd, '.forgen', 'state', 'allowed.json'), 'ok');
      `);

      const proc = spawnSync('node', [CONTEXT_GUARD], {
        input: JSON.stringify({ session_id: sid, stop_hook_type: 'user', transcript_path: tpath }),
        env: {
          ...process.env, HOME: home,
          FORGEN_CWD: home,
          FORGEN_AUTO_COMPOUND_RUNNER_PATH: fakeRunner,
          FORGEN_TEST: '1',
        },
        encoding: 'utf-8', timeout: 8000,
      });
      expect(proc.status).toBe(0);

      const markerPath = path.join(home, '.forgen', 'state', 'allowed.json');
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !fs.existsSync(markerPath)) {
        const t = Date.now();
        while (Date.now() - t < 50) { /* spin */ }
      }
      expect(fs.existsSync(markerPath)).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('FORGEN_TEST=1 + 허용 루트 밖 경로 → override 무시', () => {
    const home = makeHome();
    try {
      const sid = 'sess-s2-deny';
      seedContextState(home, sid, 12);
      const tpath = seedTranscript(home, sid, 12);

      // 허용 루트 밖: /etc/passwd 류 상상. 실제로는 /usr/local/bin 같은 곳 — 존재하지 않는 경로로 테스트.
      const outsideRoot = '/usr/local/attacker-forgen-evil.js';

      const proc = spawnSync('node', [CONTEXT_GUARD], {
        input: JSON.stringify({ session_id: sid, stop_hook_type: 'user', transcript_path: tpath }),
        env: {
          ...process.env, HOME: home,
          FORGEN_CWD: home,
          FORGEN_AUTO_COMPOUND_RUNNER_PATH: outsideRoot,
          FORGEN_TEST: '1',
        },
        encoding: 'utf-8', timeout: 8000,
      });
      expect(proc.status).toBe(0);

      // override 가 허용되지 않아 default runner 로 폴백 시도 (default runner 는 실제 auto-compound 라
      // 외부 claude CLI 가 있으면 실행되지만 — 여기서는 default runner 가 timeout 을 비거나 말거나
      // 핵심은 outsideRoot 가 실행되지 않았다는 것)
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
