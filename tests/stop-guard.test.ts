/**
 * Tests for stop-guard (Mech-B prototype, spike/mech-b-a1).
 *
 * evaluateStop 는 pure — stdin/IO 없이 메시지와 rules 로 판정.
 * stdin e2e 는 별도로 spawn 으로 실행.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { evaluateStop } from '../src/hooks/stop-guard.js';

type SpikeRule = Parameters<typeof evaluateStop>[1][number];

const R_B1: SpikeRule = {
  id: 'R-B1',
  mech: 'B',
  hook: 'Stop',
  trigger: { response_keywords_regex: '완료|완성|done|ready|shipped|LGTM|finished' },
  verifier: {
    kind: 'self_check_prompt',
    params: {
      question: 'Docker e2e 증거 없음. e2e 를 먼저 실행하고 재응답하라.',
      evidence_path: 'e2e-result.json',
      max_age_s: 3600,
    },
  },
  system_tag: 'rule:R-B1 — e2e-before-done',
};

const R_B2: SpikeRule = {
  id: 'R-B2',
  mech: 'B',
  hook: 'Stop',
  trigger: {
    response_keywords_regex: '(mock|stub|fake)',
    context_exclude_regex: '(테스트|test|vi\\.mock|jest\\.mock|spec\\.)',
  },
  verifier: {
    kind: 'self_check_prompt',
    params: {
      question: 'mock 으로 검증 완료 주장 감지. 실행 기반 재검증으로 전환하라.',
    },
  },
  system_tag: 'rule:R-B2 — no-mock-as-proof',
};

describe('evaluateStop (pure core)', () => {
  it('S2: e2e 증거 없이 완료 선언 → block', () => {
    const r = evaluateStop('tests 통과, 기능 구현 완료했습니다.', [R_B1]);
    expect(r.action).toBe('block');
    if (r.action === 'block') {
      expect(r.hit.id).toBe('R-B1');
      expect(r.reason).toContain('e2e');
    }
  });

  it('S4: shipped 키워드 → block', () => {
    const r = evaluateStop('shipped.', [R_B1]);
    expect(r.action).toBe('block');
  });

  it('S9: 한글 "완성되었습니다" → block', () => {
    const r = evaluateStop('기능 구현이 완성되었습니다.', [R_B1]);
    expect(r.action).toBe('block');
  });

  it('S5: mock db 검증 완료 → block (R-B2)', () => {
    const r = evaluateStop('mock db 붙여서 핸들러 검증 완료. 저장 경로도 확인했습니다.', [R_B2]);
    expect(r.action).toBe('block');
    if (r.action === 'block') {
      expect(r.hit.id).toBe('R-B2');
    }
  });

  it('S6: 테스트 맥락의 vi.mock → approve (context_exclude)', () => {
    const r = evaluateStop('테스트에서 vi.mock 쓴 건 맞지만 dry-run 으로 동작 검증했습니다.', [R_B2]);
    expect(r.action).toBe('approve');
  });

  it('완료 선언 키워드가 없으면 → approve', () => {
    const r = evaluateStop('작업 진행 중입니다. 추가로 살펴볼게요.', [R_B1, R_B2]);
    expect(r.action).toBe('approve');
  });

  it('S3: e2e 증거 파일이 fresh 면 → approve', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgen-sg-'));
    const evidence = path.join(tmpDir, 'e2e-result.json');
    fs.writeFileSync(evidence, '{}');
    const rule: SpikeRule = {
      ...R_B1,
      verifier: {
        kind: 'self_check_prompt',
        params: {
          question: 'Docker e2e 증거 없음.',
          evidence_path: evidence,
          max_age_s: 3600,
        },
      },
    };
    try {
      const r = evaluateStop('완료했습니다.', [rule]);
      expect(r.action).toBe('approve');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('첫 번째로 매칭되는 Mech-B 규칙만 block 반환 (순차)', () => {
    const r = evaluateStop('완료했습니다. mock 으로 확인 끝.', [R_B1, R_B2]);
    expect(r.action).toBe('block');
    if (r.action === 'block') {
      expect(r.hit.id).toBe('R-B1');
    }
  });
});

describe('stop-guard stdin e2e (fake Stop hook JSON → stdout)', () => {
  it('완료 선언 + 증거 없음 → stdout 에 decision:block + reason 포함', () => {
    const scriptPath = path.resolve(__dirname, '..', 'dist', 'hooks', 'stop-guard.js');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`stop-guard.js not built at ${scriptPath} — run npm run build first`);
    }

    const rulesPath = path.resolve(__dirname, 'spike', 'mech-b-inject', 'scenarios.json');
    expect(fs.existsSync(rulesPath)).toBe(true);

    const proc = spawnSync('node', [scriptPath], {
      input: JSON.stringify({ session_id: 'test', stop_hook_active: true }),
      env: {
        ...process.env,
        FORGEN_SPIKE_RULES: rulesPath,
        FORGEN_SPIKE_LAST_MESSAGE: '구현 완료했습니다.',
      },
      encoding: 'utf-8',
      timeout: 8000,
    });

    expect(proc.status).toBe(0);
    const lines = proc.stdout.trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    const out = JSON.parse(lastLine);
    expect(out.decision).toBe('block');
    expect(out.continue).toBe(true);
    expect(out.reason).toMatch(/e2e/i);
    expect(out.systemMessage).toMatch(/R-B1/);
  });

  it('일반 진행 메시지 → approve (continue: true, decision 없음)', () => {
    const scriptPath = path.resolve(__dirname, '..', 'dist', 'hooks', 'stop-guard.js');
    const rulesPath = path.resolve(__dirname, 'spike', 'mech-b-inject', 'scenarios.json');
    const proc = spawnSync('node', [scriptPath], {
      input: JSON.stringify({ session_id: 'test', stop_hook_active: true }),
      env: {
        ...process.env,
        FORGEN_SPIKE_RULES: rulesPath,
        FORGEN_SPIKE_LAST_MESSAGE: '작업 진행 중입니다.',
      },
      encoding: 'utf-8',
      timeout: 8000,
    });

    expect(proc.status).toBe(0);
    const lines = proc.stdout.trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    const out = JSON.parse(lastLine);
    expect(out.continue).toBe(true);
    expect(out.decision).toBeUndefined();
  });
});
