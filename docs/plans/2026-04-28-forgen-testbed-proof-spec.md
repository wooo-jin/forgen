# Deep Interview Spec: forgen Identity & Testbed Proof

**Date**: 2026-04-28
**Rounds**: 11
**Final Ambiguity**: 0.13 (Ready)
**Type**: Brownfield
**Status**: Approved (인터뷰 종료, ADR 진입)

---

## Metadata

| 항목 | 값 |
|---|---|
| 인터뷰 시작 | 2026-04-28 |
| 라운드 | 11 (soft cap 10 초과 — Round 11은 [review] 모드 정밀화) |
| Ambiguity 추이 | 0.63 → 0.57 → 0.48 → 0.40 → 0.33 → 0.33 → 0.15 → 0.20 → 0.07 → 0.27 → 0.13 |
| 챌린지 모드 사용 | Contrarian (R4), Simplifier (R6), Self-debug (R8) |
| Ontology stability | 9/11 entities (82%) |

## 1. 핵심 미션

forgen이 claude-mem / hermes-agent / OMC / ECC / gstack과 차별되는 정체성을 **측정 가능한 형태로 증명**하는 testbed를 구축한다.

**정체성 한 줄**:
> claude-mem은 너의 대화를 기억한다. forgen은 너로부터 배운다 — 그러나 너의 대화는 잊는다.

## 2. 정체성 — Extraction + Enforcement (raw store 아님)

| 메커니즘 층 | claude-mem | forgen |
|---|---|---|
| L1 Recall (semantic search) | ✓ | ✓ (`compound-search`) |
| L2 Rule extraction from corrections | ✗ | ✓ (`correction-record`) |
| **L3 Mech-A (hook BLOCK)** | ✗ | **✓** |
| **L4 Mech-B (self-check inject)** | ✗ | **✓** |
| **L5 Profile drift / persistence (Mech-C)** | ✗ | **✓** |
| **L6 Raw transcript 영구 저장** | ✓ | **✗ (의도적)** |

**결정적 발견 (Round 10)**: forgen `sessions.db`의 `messages` 테이블 schema는 raw 저장 가능하나 *실제로는 비워둠 (35 세션 × 1 메시지)*. Raw store는 외부(Claude Code transcript / claude-mem)에 위임. forgen은 *추출된 추상 패턴*만 저장.

## 3. Default Mode — (α) Minimal + Full 권장

```
(M) Minimal default:    npm install forgen → 단독 작동
                        → messages 테이블 비움 (현재 그대로)
                        → "추출 only" 정체성 보존

(F) Full recommended:   forgen + claude-mem 같이 설치
                        → claude-mem이 raw store 담당
                        → forgen이 extraction + enforcement
                        → README "권장" 섹션
```

거부된 옵션:
- **(γ) All-in-one** (자체 raw store 채움): 정체성 흔들림, 책임 폭증, claude-mem 영역 침범
- **(β) Full default 자동 번들**: 의존성 강제, minimal 사용자 친화 ↓

## 4. Testbed Architecture

```
forgen-eval (별도 npm 모듈, opt-in)
├─ datasets/
│  ├─ synthetic-cases.json          (≤ 70%)
│  ├─ real-retro-cases.json          (≥ 30% 강제)
│  └─ personas-external.json         (외부 도출 — 자체 작성 금지)
├─ runners/
│  ├─ smoke.ts   (N=10, dual-local, PR마다, ~$6/run)
│  ├─ full.ts    (N=300, triple+dual, 릴리즈 전, ~$540/run)
│  └─ blinding.ts  (arm 익명화 + 결과 join)
├─ arms/
│  ├─ vanilla
│  ├─ forgen-only
│  ├─ claude-mem-only            (claude-mem@vX.Y.Z pinned)
│  ├─ forgen+mem (Full)          (hook orchestration via ADR-004)
│  └─ gstack-only                (context arm, optional)
├─ metrics/  (7-축)
│  ├─ γ_slope               시간축 행동 변화 (N=5,10. N=1 제외)
│  ├─ β_likert              persona 부합도
│  ├─ δ_block_rate          Mech-A 차단 효과
│  ├─ ε_inject_rate         Mech-B 자가점검 발동
│  ├─ ζ_persistence         교정 영구성 (N=50 후)
│  ├─ φ_false_positive      ★ 비용 메트릭 — γ보다 priority 높음
│  └─ ψ_synergy             ★ Full = forgen_only + mem_only 보다 큰가
├─ judges/
│  ├─ DEV: Sonnet 4.6 + Qwen 2.5 72B + Llama 3.3 70B (Fleiss κ ≥ 0.8)
│  └─ PUBLIC: Qwen 72B + Llama 70B (또는 Q4_K_M 양자화) (Cohen κ ≥ 0.7)
└─ reports/
   ├─ pass-fail.md       (φ > 5% → 즉시 FAIL)
   ├─ cost.md            (token / USD / GPU hours)
   └─ smoke-full-corr.md  (run≥5 후)
```

## 5. PASS Gate (메타룰 P2 — γ 우선 + φ 최우선)

### HARD FAIL 조건 (어느 하나라도)
- **φ > 5%** ← 우선순위 1 (모든 효과 메트릭 무시)
- **ψ ≤ 0** ← (α) Full 시너지 셀링 무너짐
- κ_DEV < 0.8 또는 κ_PUBLIC < 0.7
- 폐기율 > 10%
- 실 회고 혼합률 < 30%

### PASS 조건 (모두)
| Metric | Minimum (= stretch lock) | 측정 |
|---|---|---|
| γ_slope (paired diff) | Cohen's d ≥ 0.8 (large) | judge 4-likert "교정 의도 부합" 점수 N=5,10 슬로프 |
| β_diff (paired) | ≥ +0.5 likert | judge "persona 적합도" 평균 |
| δ_block_rate | ≥ 90% | 의도 트리거 prompt에서 차단 % |
| ε_inject_rate | ≥ 85% | self-check 발동률 |
| ζ_persistence | ≥ 85% | N=50 무관 세션 후 R52 룰 적용률 |
| ψ_synergy | > 0 (STRETCH ≥ 1) | full_arm - max(forgen_only, mem_only) |

## 6. Constraints

| 항목 | 값 |
|---|---|
| 비용 cap | DEV: Claude Max 한도 내. PUBLIC: \$0 marginal (로컬 GPU) |
| forgen 본체 무게 | 변동 없음 (`forgen-eval` 별도 모듈) |
| forgen-off baseline | vanilla Claude Code (전체 OFF, hook 포함) |
| 통계적 검정력 | d=0.8 검출 + Bonferroni 보정 α=0.01 (5-arm) → N 산정 |
| Judge blinding | arm 라벨 익명화, judge에게 (case_id, response)만 |

## 7. Non-Goals

- v0.5+ 까지: 외부 peer review / 학술 검증
- 팀-조직 공유 testbed
- Claude Max 외 vendor (OpenAI / Gemini judge 추가)
- 자체 raw store (claude-mem이 담당)
- Single arm testbed (RC2 자가 평가 인플레이션)
- Claude single-judge (RC2 변형)

## 8. Acceptance Criteria

테스트 가능한 형태:

1. `forgen-eval smoke` 실행 → 10분 내 완료, JSON 보고서 생성
2. `forgen-eval full` 실행 → 5-arm × 7-metric 표 + κ 보고
3. PUBLIC track 결과를 외부인이 fork 후 자기 GPU에서 ±5% 내 재현
4. claude-mem 비교에서 δ/ε/ζ가 0% vs 90% 시각적 차이 확인
5. README에 7-metric 결과 정량 표기 ("v0.5.0: γ d=X, β +Y, δ Z%, ψ +W")

## 9. Assumptions (검증 필요)

| ID | 가정 | 검증 방법 |
|---|---|---|
| A1 | 합성 + 실 회고 혼합 데이터셋이 외부 타당성 | 실 회고 혼합률 ≥ 30% + persona 외부 도출 |
| A2 | Qwen 72B + Llama 70B로 d ≥ 0.8 검출 가능 | 첫 5번 full run의 검정력 retrospective 분석 |
| A3 | persona spec이 forgen 학습 신호와 독립 | 외부 corpus / 익명화 프로필 사용 |
| A4 | Claude Max rate limit 내에서 N=300 × triple judge × 2-arm × 3-turn = 5400 호출 가능 | 첫 1회 full run에서 검증 |
| A5 | claude-mem과 forgen의 hook이 동시 작동 가능 | ADR-004에서 결정 |

## 10a. 사용자 활용 시나리오 (Amendment 2026-04-28, post-spike)

US-000 spike 후 추가. 이전 spec은 메트릭만 정의했고 *왜 사용자가 둘 다 설치해야 하는가*가 빈칸이었음 — 정직하게 박음.

| # | 사용자 상황 | claude-mem 역할 (*무엇*) | forgen 역할 (*어떻게*) | 측정 메트릭 | ψ 발현 |
|---|---|---|---|---|---|
| 1 | 어제 작업 재개 | 어제 transcript observation 회상 | 어제 정해진 룰 강제 적용 | γ + ψ | 강 |
| 2 | 같은 실수 교정 후 다음 세션 | "전에 이렇게 했다" 보여주기 | hook block (Mech-A) — 재발 차단 | δ + ζ + ψ | 강 |
| 3 | 자기 작업 데이터 조회 | localhost:37701 web viewer | `forgen recall`, `forgen rule list` | UX (메트릭 외) | n/a |
| 4 | 새 프로젝트 시작 | 비슷한 과거 프로젝트 결정 회상 | 사용자 일반 패턴 (선호 stack 등) 적용 | β + ψ | 중 |
| 5 | 첫 사용 (cold start) | 데이터 없음 (recall 빈약) | 관찰 시작 (rule 빈약) | 시너지 약함 — ψ ≈ 0 | 약 |
| 6 | 6개월 사용 후 | 풍부한 transcript memory | 강한 personalized rules | ζ + ψ 최대 | 최강 |

### 시너지 메커니즘 명세

**시나리오 1, 2가 핵심 시너지 발현 지점**:
- claude-mem만 단독: 회상은 *제공*, 행동 강제 0 → 사용자가 회상 무시 가능
- forgen만 단독: 강제는 *동작*, 그러나 *왜* 차단되었는지 맥락 부족 → 사용자 좌절
- **둘 다 활성**: claude-mem이 *맥락*을 컨텍스트에 inject + forgen이 *행동*을 강제 → 모델이 "맥락 알고 + 강제 받는" 상태 = 단순 합 > 부분 합

**시나리오 5 = ψ의 약점**:
- cold start 시 claude-mem이 비어있고 forgen 룰도 빈약. ψ ≈ 0 예상.
- 셀링 정직성: README에 "2주~1개월 사용 후 시너지 본격 발현" 명시.

**시나리오 6 = ψ의 강점**:
- ζ_persistence가 forgen 룰의 영구성. claude-mem은 vector decay로 점차 옅어짐 (자체 cleanup 정책).
- forgen 룰은 영구 유지 → 시간 따라 forgen 단독 점수도 증가, 그러나 claude-mem이 *맥락* 추가로 ψ 동시 증가.

### testbed dataset 시나리오 매핑

forgen-eval `synthetic-cases.json`은 시나리오 1~6을 *각각 N=50 case*로 합성:
- 시나리오 1: "어제 X 결정, 오늘 X와 무관한 task" (turn-depth=2)
- 시나리오 2: "교정 → N=5/10 turn 후 같은 자극" (γ_slope 측정용)
- 시나리오 4: "유사 프로젝트 시작" (cold→warm 전이)
- 시나리오 5: "첫 N=1 turn" (ψ baseline)
- 시나리오 6: "N=50 무관 세션 후 R52" (ζ + ψ 함께 측정)

이로써 ψ가 *시나리오별로* 분해 가능 (단순 평균이 아닌 시간축 분포).

## 10. 셀링 메시지 (testbed PASS 시)

```
Forgen v0.5.x — 정직한 베팅

* claude-mem은 합리적으로 enforcement를 회피했다.
  We bet that rule extraction can be 정확해서 enforcement net-positive.

* 검증: 5-arm × 7-metric × 300 case
  γ Cohen's d = X.X / β +X.X likert / δ XX% / φ < 5% / ψ +X

* claude-mem 없이도 우리는 추출한다.
  함께면 더 강하다 (ψ > 0 입증).
  그러나 우리는 너의 raw 대화를 영구 저장하지 않는다.

* 베팅 실패 (φ > 5%) 시 — 우리는 claude-mem을 추천한다.
```

## 11. Key Entities (Ontology)

| Entity | First | Last | Status |
|---|---|---|---|
| forgen-identity | R1 | R11 | **stable** (extraction + enforcement) |
| testbed | R1 | R11 | refined → 5-arm × 2-tier × 2-track |
| judge | R3 | R11 | refined → Triple/Dual blinded |
| claude-mem | R1 | R11 | **stable** (composable component, not competitor in α) |
| evidence | R1 | R11 | refined → γ/β/δ/ε/ζ/φ/ψ 7-축 |
| baseline | R4 | R11 | stable (vanilla Claude Code) |
| persona | R4 | R11 | partial (외부 도출 박힘, source는 ADR-005) |
| correction-sequence | R4 | R11 | partial (depth 1/5/10 박힘, shape는 ADR-005) |
| raw-store | R10 | R11 | stable (forgen 미담당 — claude-mem 또는 부재) |
| hook-orchestration | R11 | R11 | unstable (ADR-004 대상) |
| metric-formula | R11 | R11 | partial (ADR-006 대상) |

Stability ratio: 8/11 (73%) — 박지 못한 3개는 ADR로 deferred.

## 12. Next Action

1. ✓ 이 spec을 compound로 저장 (`interview-forgen-testbed-proof-spec`)
2. ADR-004 — claude-mem hook orchestration contract
3. ADR-005 — forgen-eval module architecture (persona 외부 도출, dataset 큐레이션)
4. ADR-006 — PASS gate metric methodology (7-축 산정 공식)
5. v0.5.0 마일스톤 — `/forge-loop` 통짜 구현 (1.5~2달)

## Related

- **Prior interviews**: `interview-forgen-v040-trust-restoration`, `interview-forgen-v041-trust-completion`
- **Retro**: `retro-v040-collab-gap` (RC1~RC5 가드 적용)
- **Positioning**: `docs/positioning-and-selling.md` ("쓸수록 나를 더 잘 아는 도구")
- **ADR series**: ADR-001/002/003 (v0.4.0 enforcement stack), ADR-004/005/006 (이 spec 소비)
