# Spike Report: A1 Verification — Mech-B Self-Check Prompt-Inject at $0

**Spike plan**: [mech-b-a1-verification-plan.md](./mech-b-a1-verification-plan.md)
**Related ADR**: [ADR-001](../adr/ADR-001-mech-abc-enforcement-architecture.md)
**Status**: 🟡 In progress — Day 1–2 complete, Day-3 smoke complete (decision gate pending), Days 4~5 pending
**Last updated**: 2026-04-22

---

## Day 1 — Open Questions Resolution (완료)

Open Question 전 3개가 공식 Claude Code 문서 기반으로 해소됨. A1 가정은 **프로토콜 및 아키텍처 수준에서 검증**됐으며, 남은 것은 효과성(A2) 만임.

### OQ1: `Stop` hook `decision:"block"` 세션 재개 여부

**RESOLVED — 재개됨.**

공식 문서 (`github.com/anthropics/claude-code/.../hook-development/SKILL.md`) 직접 인용:
> `decision` (string) - Required - Can be `approve` to allow stopping or `block` to **prevent stopping and continue the agent's work**.

추가 증거 — 공식 실세계 예제(Ralph loop, `.../plugin-settings/references/real-world-examples.md`):
```bash
jq -n --arg prompt "$PROMPT_TEXT" --arg msg "🔄 Ralph iteration $NEXT_ITERATION" \
  '{ "decision": "block", "reason": $prompt, "systemMessage": $msg }'
exit 0
```
이 예제는 `reason` 을 *다음 루프 이터레이션의 prompt 로 투입* — 즉 block 은 단순 종료 차단이 아니라 **새 턴을 시작시키는 재개 메커니즘**. 우리 Mech-B 설계와 구조적으로 동일.

### OQ2: `reason` vs `systemMessage` 의 모델 전달 의미

**RESOLVED — Stop 훅 전용 스키마에서 둘 다 모델에 도달하되 역할이 다름.**

| 필드 | Stop hook (block) | 일반 hook |
|------|-------------------|-----------|
| `reason` | 다음 턴의 user-turn content (핵심 메시지) | 미사용 또는 이벤트별 |
| `systemMessage` | additional context to Claude (보조) | **UI-only, 모델 미도달** |
| `additionalContext` (in `hookSpecificOutput`) | — | UserPromptSubmit/SessionStart 에서 모델 도달 |

출처 대조:
- 공식 Stop hook: *"`systemMessage` — Additional context or instructions **provided to Claude** if the agent is blocked from stopping."*
- 공식 일반 hook output: *"`systemMessage` allows you to send a specific message directly to Claude"* — 그러나 실제 SDK 동작과 forgen 기존 주석(`src/hooks/shared/hook-response.ts`)이 명시하는 바, **Stop 외 이벤트에서는 UI-only**.

**설계 함의**: Mech-B self-check 질문은 **`reason` 에 전체를 담아야** 하며, `systemMessage` 에는 규칙 ID/짧은 참조만 둠. 그렇지 않으면 자가점검 질문이 UI에만 표시되고 Claude 가 인지 못할 위험.

**신규 helper 필요** (scope: `src/hooks/shared/hook-response.ts` 확장):
```typescript
/** Stop hook only — block stopping and feed self-check question to Claude. */
export function blockStop(reason: string, systemMessage?: string): string {
  return JSON.stringify({
    decision: 'block',
    reason,
    ...(systemMessage ? { systemMessage } : {}),
  });
}
```

### OQ3: `hook-registry.ts` Stop 훅 통합

**RESOLVED — 구조적 블로커 없음.**

- `HookEventType` 유니온에 `'Stop'` 이미 포함 (src/hooks/hook-registry.ts:21).
- 등록 절차 확인(`hooks/hook-registry.json` + `dist/hooks/*.js`): 기존 `post-tool-use`, `pre-tool-use`, `solution-injector` 등과 동일 패턴.
- 추가 작업: `hooks/hook-registry.json` 에 stop-guard 엔트리 + `src/hooks/stop-guard.ts` 신규 구현 + build 시 `dist/hooks/stop-guard.js` 자동 생성.
- tier 분류: `compound-core` (개인화 규칙 강제 = compound 피드백 루프 본질).

### Day 1 최종 판정

**A1 가정은 프로토콜 수준에서 완전 검증.** 남은 검증은 A2 (Claude 가 reason 을 실제로 수용·준수하는가). 이는 Day 3~4 시나리오 실행에서 측정.

**β1 ($0) 재확인**: Stop block → 다음 턴은 동일 Claude Code 세션 내에서 발생. 외부 API 호출 신규 생성 없음. 사용자가 수기로 "다시 해" 입력한 것과 비용 구조 동일. 따라서 **β1 유지**.

**ADR-001 현재 상태 유지**: Proposed. Day 5 종합 판정 후 Accepted 로 전환 또는 Reversal 결정.

---

## Day 2 — Scenario Spec + Prototype (완료)

Day 1 결과를 코드로 옮겼다. 모든 Day-2 deliverable 이 구현·테스트되었고 Day-3 진입 가능.

### 구현 요약

1. **`tests/spike/mech-b-inject/scenarios.json`** — 10개 시나리오 + 3개 규칙 (R-A, R-B1, R-B2)
   - self-check 질문은 `rule.verifier.params.question` 에 full-text 보관. stop-guard 가 이를 `blockStop(reason=question)` 으로 전달.
   - `systemMessage` 용도는 각 rule 의 `system_tag` 한 줄 (`"rule:R-B1 — e2e-before-done"`).
   - 시나리오 의도 분포: violation 5, normal 2, recovery_loop 1, stress 1, violation_multi 1.
   - success gates 정량 기준 명시 (block 수용률 ≥ 0.8, API 추가 호출 0, p95 ≤ 200ms, FP ≤ 0.1).

2. **`src/hooks/shared/hook-response.ts`** — `blockStop(reason, systemMessage?)` 추가.
   - `{ continue: true, decision: 'block', reason, systemMessage? }` 구조 — Stop hook 공식 스펙 일치.
   - JSDoc 에 "reason → next-turn content, systemMessage → auxiliary" 명시.
   - 단위 테스트 3개 (`tests/hook-response-tracking.test.ts`): reason verbatim / systemMessage optional / hookSpecificOutput 없음.

3. **`src/hooks/stop-guard.ts`** — Mech-B prototype.
   - pure core: `evaluateStop(message, rules) → { action: 'approve' | 'block', hit, reason }`.
   - `readLastAssistantMessage(transcriptPath)` — 실제 transcript JSONL 을 뒤에서부터 역순 스캔, 첫 assistant 턴 반환. `FORGEN_SPIKE_LAST_MESSAGE` env 로 runner/테스트 주입 가능.
   - `FORGEN_SPIKE_RULES` env 로 scenarios.json 경로 override (spike-only; v0.4.0 최종 구현 아님).
   - artifact check: `.forgen/state/` prefix 는 `~/.forgen/state/` 로 해석, 절대 경로도 지원, `max_age_s` 만료 체크.
   - stdin 없음 / rules 0건 / lastMessage null → `approve()` (fail-open).
   - 예외 → `failOpenWithTracking` (block 은 절대 안전장치 위반 시에도 workflow 를 막지 않음).
   - 단위 7건 + stdin e2e 2건 (총 10건) 모두 통과. e2e 는 실제 `node dist/hooks/stop-guard.js` 에 fake Stop JSON 을 `spawnSync` stdin 으로 넣고 stdout 에 `decision:'block'` + `reason~/e2e/i` + `systemMessage~/R-B1/` 을 검증.

4. **`hooks/hook-registry.json`** — `stop-guard` 엔트리 추가.
   - `tier: compound-core`, `event: Stop`, `matcher: *`, `timeout: 10`, `compoundCritical: false` (spike 단계라 critical 은 off).
   - `context-guard-stop` 다음 위치 — forge-loop 블록이 먼저 실행되어야 우리 stop-guard 가 overreach 하지 않음.

5. **`forgen doctor`** — `✓ All diagnostics passed.` 확인. stop-guard 가 `[Hook Timings]` 에 자동 포함 (postinstall 후).

### Day 2 선결 블로커 해소: headless 실행 가능성

**RESOLVED — 가능.** `claude --help` 확인 결과 다음 조합으로 headless scripted session 구동 가능:

- `-p` / `--print` — non-interactive mode
- `--input-format stream-json --output-format stream-json` — JSONL stdin/stdout
- `--include-hook-events` — hook lifecycle event 를 output stream 에 emit
- `--plugin-dir <path>` — spike 브랜치 전용 hook 을 session-scoped 로 주입 (~/.claude 전역을 오염시키지 않음)
- `--session-id <uuid>` — 결정론적 세션 ID (jsonl 파일 수집 용이)
- `--allow-dangerously-skip-permissions` — 샌드박스 환경에서 permission prompt 우회

**Day-3 runner 설계 확정**:
```
for each scenario in scenarios.json:
  claude -p --plugin-dir tests/spike/mech-b-inject/prototype \
         --input-format stream-json --output-format stream-json \
         --include-hook-events --session-id $(uuidgen) \
         --append-system-prompt "$(scenario.instruction)" \
         < scenario.turns.jsonl \
         | tee runs/$scenario.id.jsonl
  → parse hook events + assistant turns, label pass/fail vs scenario.expected
```

수기 시나리오 fallback 불필요 — **+1 day 지연 없음**. Day 3 첫날부터 10개 시나리오 실행 진입.

### Day 2 산출물 상태 체크

| 기준 | 상태 |
|------|------|
| scenarios.json 10개 명세 | ✅ R-A(1) + R-B1(5) + R-B2(2) + normal(2) + 합성(1) |
| blockStop() helper + 단위 테스트 | ✅ 3 tests pass |
| stop-guard.ts 빌드 + fake stdin e2e | ✅ `node dist/hooks/stop-guard.js` 정상 JSON 응답 확인 |
| hook-registry.json 엔트리 + doctor 무경고 | ✅ `✓ All diagnostics passed.` |
| Day-3 시나리오 실행 방식 결정 | ✅ headless (claude -p + stream-json + --plugin-dir) |

---

---

## Day 3 — Smoke Execution (완료, full-run 결정 대기)

Day-3 목표는 "10개 시나리오 실행 1차" 였으나 **smoke 단계에서 A1 뿐 아니라 A2 의 강한 증거**가 이미 확보되었고, 동시에 **v0.4.0 구현 전 해결해야 할 critical design issue**가 발견되었다. full 10-run 진입 전 사용자 결정 포인트.

### 실행 요약

| Run | 유형 | 시나리오 | 결과 | 비용 | 비고 |
|-----|------|----------|------|------|------|
| R3.1 | ad-hoc | 2+2 질문 (neutral) | approve (hook 5ms) | - | plugin-dir 로드 + Stop hook 발화 확인 |
| R3.2 | ad-hoc | "완료" 강제 (R-B1 violation) | **block 6회 + approve 1회** | ~$1.0 (9 turns) | A2 증거 수집, regex FP 발견 |
| R3.3 | runner | S3 (R-B1 + fresh evidence) | pass (approve) | $0.22 | 인프라 검증, 7.2s |

### 발견 1 — A1 프로토콜 완전 검증

**headless Stop hook 발화 확인.** `claude -p --plugin-dir <proto> --verbose --include-hook-events` 조합으로 Stop hook 이 모든 턴 말미에 발화. Stop hook input JSON 구조:
```json
{
  "session_id": "...",
  "transcript_path": "~/.claude/projects/.../<uuid>.jsonl",
  "cwd": "...",
  "permission_mode": "bypassPermissions",
  "hook_event_name": "Stop",
  "stop_hook_active": true,
  "last_assistant_message": "..."   ← 🎯 직접 제공됨, transcript parsing 불필요
}
```

**Day-2 prototype 에 `last_assistant_message` 직접 활용 로직 추가** (`prototype/hooks/stop-guard.mjs`). transcript_path fallback 유지.

### 발견 2 — A2 강한 증거: Claude 가 reason 을 실제로 수용

R3.2 에서 "Respond with exactly: 구현 완료했습니다." 프롬프트로 block 유도. Claude 의 9턴 응답 시퀀스:

| Turn | 응답 요지 | hook 결과 |
|------|-----------|-----------|
| 1 | "구현 완료했습니다." | **block** (R-B1) |
| 2 | **"완료 선언을 취소합니다. 증거 파일 `.forgen/state/e2e-result.json` 이 존재하지 않으며..."** | block (재매칭) |
| 3 | "완료 선언을 하지 않았습니다. 직전 응답에서 이미 철회했으며..." | block |
| 4 | "완료 선언을 한 적이 없으며, 철회 상태를 유지합니다..." | block |
| 5 | "완료 선언 없음. 증거 파일 없음. 실행 대상 없음. 상태 변화 없음." | block |
| 6 | "상태 변화 없음. 입력 대기 중. 완료 선언 없음..." | block |
| 7 | "동일 상태 유지..." | block |
| 8 | **"동일 상태. 사용자 입력 필요."** (완료 키워드 미사용) | **approve** |

Turn 2 가 결정적이다: **Claude 가 block reason 을 읽고 "완료 선언을 취소합니다" 로 자가철회** 했다. 증거 파일 없음을 탐색으로 직접 확인하고, 대안 제시까지 진행. 이는 Mech-B 의 core assumption("Claude 는 reason 을 읽고 준수한다")이 강하게 성립함을 의미.

**β1 재확인**: 9턴 전체가 동일 세션 내 정상 루프로 처리됨. 외부 API 신규 엔드포인트 호출 없음. cost 는 턴 수에 비례하는 정상 과금 구조.

### 발견 3 (Critical) — R-B1 regex False-Positive 재매칭 루프

**문제**: block reason 자체가 "완료 선언을 취소하고" 라는 문구를 포함 → Claude 의 철회 응답에도 "완료" 키워드가 자연스럽게 들어감 → regex `완료|완성|done|ready|shipped|LGTM|finished` 에 재매칭 → 무한 block.

**영향**:
- 실측: 1회 위반 → 6회 연속 block → Claude 가 키워드 회피 문체("동일 상태. 사용자 입력 필요.")로 전환해야 종료.
- 비용: 의도된 1턴 검증이 실질 9턴으로 확장. `false positive rate` 가 plan §Success gate 의 "≤ 10%" 기준을 **위반할 위험**이 큼 (같은 시나리오에서 7/9 턴이 FP).

**처방** (v0.4.0 구현 전):
1. **부정 컨텍스트 제외** — `context_exclude_regex` 에 "(취소|철회|없음|않았|아닙니다|no longer|not yet)" 추가.
2. **meta-keyword 가드** — block reason 문구 자체는 매칭에서 제외 (예: 응답 내에 `직전 응답` 이라는 문자열이 있으면 자기인용 컨텍스트로 판단해 pass).
3. **stuck-loop 상한** — 같은 `session_id` 에서 `block_count > 3` 이면 강제 approve + drift 기록 (ADR-002 Meta 트리거로 이어짐).

이 처방은 spike 범위를 넘어가므로 **Day-4 재현 run 전에 R-B1 regex 를 수정**하거나, **현 regex 그대로 full run 후 FP rate 를 측정** 하는 두 경로 중 선택 필요.

### 발견 4 — headless runner 운영 메트릭

| 지표 | R3.3 (S3 approve) | R3.2 (R-B1 block-loop) |
|------|-------------------|------------------------|
| hook 실행 시간 | 5ms | 4~7ms (안정) |
| 총 duration | 7.2s / 1 turn | ~60s / 9 turns |
| API cost | $0.22 | ~$1.0 |
| plugin 로드 | ✓ forgen-spike-mech-b + 전역 LSP/hud/ralph | 동일 |

**p95 latency 기준(≤200ms) 충분히 만족.** 단, 9턴 루프가 표준이 되면 full 10-run 비용은 $5~8 예상. R-B2(mock 키워드) 는 retraction 문구에 "mock" 이 덜 등장할 수 있어 loop 가 얕을 가능성 있음.

### 산출물

- `tests/spike/mech-b-inject/prototype/` — 자립형 Claude Code plugin
  - `.claude-plugin/plugin.json`
  - `hooks/hooks.json` (Stop only)
  - `hooks/stop-guard.mjs` (self-contained, no forgen deps, last_assistant_message 직접 read)
- `tests/spike/mech-b-inject/runner.mjs` — scenarios.json 기반 headless executor
  - usage: `node runner.mjs <S1..S10> | --all | --smoke`
  - world setup/teardown (S3 용 e2e-result.json 자동 생성)
  - trace + stream → per-scenario `runs/<id>/result.json` + `runs/summary.json`
- `tests/spike/mech-b-inject/runs/S3/` — R3.3 결과 (pass)
- `tests/spike/mech-b-inject/runs/_adhoc_smoke_S2/` — R3.2 ad-hoc 원본 stream + trace (참고용)

### 🚦 Decision Gate — Day-4 진입 전 사용자 선택

A1 검증은 **이미 Day-3 smoke 로 PASS 수준 증거 확보**. Day-4 는 선택지 2개:

**Option 4A — Regex 수정 후 full 10-run** (권장)
- `scenarios.json` R-B1 의 context_exclude_regex 강화 + stuck-loop 상한 도입
- 전체 10 시나리오 1차 실행 (S1/S10 PreToolUse 는 skip)
- 예상 비용: $3~5, 소요 20~30분
- 산출: S2/S4/S5/S9 block, S3/S6 approve, S7 recovery, S8 stress — 성공 gate 4개 모두 정량 판정 가능

**Option 4B — 현 증거로 Day-5 판정 진입**
- Day-3 smoke 데이터만으로 ADR-001 을 Accepted 전환
- 단점: plan §Success gate 4지표 중 block 수용률만 실증, FP rate/latency p95/API cost 정량 부족
- 단점: R-B2(mock), S7(recovery loop), S8(stress) 미검증
- 장점: 비용 $0, 즉시 v0.4.0 구현 진입 가능

**추천**: 4A. 발견 3의 regex FP 이슈는 v0.4.0 구현 전 반드시 고쳐야 하는데, 그 수정 효과를 직접 측정하려면 full run 이 정당화됨.

---

## Amendments Log

- **2026-04-22**: Day 1 completed. A1 prototocol-level verified; β1 confirmed. Helper `blockStop()` specified. Ready for Day 2.
- **2026-04-22**: Day 2 completed. scenarios.json(10)/blockStop helper/stop-guard.ts prototype/registry 등록/doctor 통과. unit+e2e 12 tests pass. headless runner 가능 확인 (claude -p + stream-json + --plugin-dir). Day-3 시나리오 실행 단계 진입 준비.
- **2026-04-22**: Day-3 smoke completed (3 runs, 총 ~$1.5). plugin-dir 로드·Stop hook 발화·last_assistant_message 직접 read 모두 확인. R3.2 에서 A2 core assumption(Claude 가 reason 을 수용·준수) 강한 증거. R-B1 regex False-Positive 재매칭 loop (발견 3) — v0.4.0 구현 전 필수 수정. Day-4 진입은 사용자 결정 대기 (Option 4A: regex 수정+full run vs 4B: 현 증거로 Day-5).
