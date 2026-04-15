# Forgen 시나리오별 스킬/에이전트 활용 맵

> 각 시나리오는 실제 개발자의 하루를 기반으로 구성.
> 핵심: 같은 시나리오를 **두 번째** 할 때 forgen이 어떻게 달라지는가.
>
> **구현 상태 (2026-04-14)**: 최종 10개 스킬로 반영됨.
> - `ultrawork` 연기 (forge-loop 내부 병렬화로 대체)
> - `ci-cd` 삭제 (compound 연동 약함)
> - `docker` 유지 (compound integration 정당화)

---

## 시나리오 전체 맵

```
일상 개발                          주기적 관리
──────────                        ──────────
S1. 새 기능 구현 (대형)             S8.  주간 회고
S2. 버그 수정                      S9.  프로필 보정
S3. 코드 리뷰                      S10. compound 정리
S4. 릴리스/배포
S5. 빠른 수정 (핫픽스)              학습 루프
S6. 리팩토링                       ──────────
S7. 새 프로젝트 온보딩              S11. 스킬 자동 추출
                                   S12. 크로스 프로젝트 학습
```

---

## S1. 새 기능 구현 (대형) — "결제 시스템 구현해줘"

**상황**: 사용자가 복잡한 기능을 처음부터 구현 요청. 요구사항이 모호함.

### 1회차 (compound 없음)

```
사용자: "결제 시스템 구현해줘"
         │
         ▼
  ┌─ /deep-interview ─────────────────────────┐
  │  "결제 시스템"이 뭔지 명확하게 만들기         │
  │                                            │
  │  주제 추출:                                 │
  │    결제 수단 (8/10)                         │
  │    PG 연동 (9/10)                          │
  │    에러 처리 (7/10)                         │
  │    환불 정책 (6/10)                         │
  │    보안 (5/10)                              │
  │                                            │
  │  5라운드 인터뷰 → 평균 ambiguity 2.8        │
  │  → "구현 준비 완료"                         │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ /forge-loop ──────────────────────────────┐
  │  PRD 자동 생성:                             │
  │    S1: 결제 모델 설계 (DB 스키마)            │
  │    S2: PG 연동 API                          │
  │    S3: 결제 플로우 구현                      │
  │    S4: 에러/환불 처리                        │
  │    S5: 테스트 작성                           │
  │                                            │
  │  에이전트 흐름:                              │
  │    planner → architect → executor           │
  │    → verifier → (실패 시 debugger)          │
  │    → critic (최종 게이트)                    │
  │                                            │
  │  S2에서 PG 연동 실패 (토스페이먼츠 API 변경)  │
  │    → debugger가 원인 파악                    │
  │    → executor가 수정                        │
  │    → verifier가 재검증                      │
  │                                            │
  │  전체 5 스토리 완료 (총 12 반복)             │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ /compound (자동 제안) ────────────────────┐
  │  추출된 패턴 3개:                           │
  │  1. "tosspayments-api-v2-webhook-format"   │
  │     (PG 웹훅 검증 시 HMAC-SHA256 필수)      │
  │  2. "payment-idempotency-key-pattern"      │
  │     (결제 중복 방지를 위한 멱등키 전략)       │
  │  3. "prisma-decimal-money-field"           │
  │     (금액은 Decimal, Float 사용 금지)        │
  └────────────────────────────────────────────┘
```

### 2회차 (compound 있음) — "구독 결제 추가해줘"

```
사용자: "구독 결제 추가해줘"
         │
         ▼
  ┌─ /deep-interview ──────────────────────────┐
  │  Compound-In 자동:                          │
  │  "이전 결제 시스템 구현에서 학습한 패턴:"     │
  │  - tosspayments webhook HMAC 검증 필수      │
  │  - 금액 필드는 Decimal 사용                  │
  │  - 멱등키로 중복 결제 방지                   │
  │                                            │
  │  → PG 연동, 금액 처리 관련 질문 스킵 가능    │
  │  → 구독 특화 질문에 집중 (과금 주기, 해지 등) │
  │  → 3라운드만에 ambiguity 2.1 달성            │
  │     (1회차 5라운드 → 2회차 3라운드: 40% 절감) │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ /forge-loop ──────────────────────────────┐
  │  Compound-In:                               │
  │  executor가 PG 연동 코드 작성 시            │
  │  "이전 솔루션: HMAC-SHA256 검증 패턴" 자동 로드│
  │  → 1회차에서 실패했던 부분을 바로 올바르게 구현│
  │                                            │
  │  전체 4 스토리 완료 (총 6 반복)              │
  │  (1회차 12반복 → 2회차 6반복: 50% 절감)      │
  └────────────────────────────────────────────┘
```

**활용 스킬/에이전트 요약**:

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 요구사항 | `/deep-interview` | analyst | In: 이전 인터뷰 로드 |
| 계획 | `/forge-loop` (내부) | planner, architect | In: 유사 작업 패턴 |
| 구현 | `/forge-loop` (내부) | executor | In: 솔루션 자동 적용 |
| 검증 | `/forge-loop` (내부) | verifier, critic | - |
| 디버깅 | `/forge-loop` (내부) | debugger | In: 이전 트러블슈팅 |
| 학습 | `/compound` | - | Out: 패턴 추출 |

---

## S2. 버그 수정 — "로그인이 안 돼요"

**상황**: 프로덕션 버그 리포트. 원인 불명.

### 흐름

```
사용자: "로그인이 안 돼요. 어제까지 됐는데"
         │
         ▼
  ┌─ Compound-In (자동, solution-injector 훅) ─┐
  │  compound-search "로그인 인증 에러"          │
  │  → 매칭 솔루션:                             │
  │    "jwt-token-expiry-timezone-issue"        │
  │    "session-cookie-samesite-chrome-update"  │
  │  → "이전에 유사한 이슈 해결 기록:" 표시      │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ 일반 대화 (스킬 불필요) ──────────────────┐
  │  에이전트 자동 라우팅:                       │
  │    explore → 관련 코드 탐색                  │
  │    debugger → 가설 수립 + 검증              │
  │                                            │
  │  compound 솔루션 힌트로 빠르게 원인 특정:    │
  │  "Chrome 131에서 SameSite 기본값 변경"       │
  │                                            │
  │  executor → 수정                            │
  │  verifier → 테스트 통과 확인                 │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ Compound-Out (자동 제안) ─────────────────┐
  │  "이 버그 해결법을 compound에 기록할까요?"    │
  │  → "chrome-samesite-cookie-breaking-change" │
  │    저장                                     │
  └────────────────────────────────────────────┘
```

**핵심**: 버그 수정은 **스킬 없이** 진행. compound의 solution-injector 훅이 자동으로 관련 솔루션을 주입하고, 해결 후 자동 추출을 제안. **스킬이 아니라 훅이 일하는 시나리오**.

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 탐색 | 없음 | explore | - |
| 분석 | 없음 | debugger | In: solution-injector 자동 주입 |
| 수정 | 없음 | executor | In: 솔루션 힌트 |
| 학습 | `/compound` (제안) | - | Out: 트러블슈팅 기록 |

---

## S3. 코드 리뷰 — "이 PR 리뷰해줘"

**상황**: 머지 전 코드 리뷰 요청.

### 흐름

```
사용자: "이 PR 리뷰해줘" 또는 "코드 리뷰해줘"
         │
         ▼
  ┌─ /code-review ─────────────────────────────┐
  │  Step 1: 관점 결정                          │
  │    키워드에 따라: 종합 / --security / --perf  │
  │                                            │
  │  Step 2: Compound-In                        │
  │    compound-search "review {변경 파일들}"    │
  │    → "이전에 이 모듈에서 발견된 이슈:"       │
  │      - "auth-middleware-race-condition" (2회) │
  │      - "prisma-n-plus-one-query" (1회)      │
  │    → 이 패턴들을 중점 확인                   │
  │                                            │
  │  Step 3: 리뷰 실행                          │
  │    에이전트: code-reviewer (Opus, READ-ONLY) │
  │    체크리스트 20항목 + compound 특이사항      │
  │                                            │
  │  Step 4: 리포트                             │
  │    APPROVE / REJECT + 발견 사항             │
  │                                            │
  │  Step 5: Compound-Out                       │
  │    CRITICAL 발견 시 → compound solution 저장 │
  │    "이 모듈에서 {이슈}가 또 발견됨" 기록     │
  │    → 다음 리뷰에서 자동 경고                 │
  └────────────────────────────────────────────┘
```

**2회차 효과**: 같은 모듈을 리뷰할 때 "이전에 여기서 race condition이 2회 발견됨"이 자동 표시. 리뷰어가 놓치기 쉬운 반복 패턴을 compound가 기억.

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 리뷰 | `/code-review` | code-reviewer | In: 이전 이슈 패턴 |
| 학습 | `/code-review` (내장) | - | Out: 신규 이슈 기록 |

---

## S4. 릴리스/배포 — "이거 배포하자"

**상황**: 기능 완성 후 릴리스.

### 흐름

```
사용자: "ship" 또는 "배포하자"
         │
         ▼
  ┌─ /ship ────────────────────────────────────┐
  │  Step 0: Pre-flight                         │
  │    git status, 미커밋 확인                   │
  │                                            │
  │  Step 1: Compound-In                        │
  │    compound-search "ship release deploy"    │
  │    → "지난 릴리스에서 이런 문제:"            │
  │      - "npm-publish-prepublish-hook-fail"   │
  │      - "changelog-format-breaking"          │
  │    → pre-flight에서 이 항목들 추가 체크      │
  │                                            │
  │  Step 2: 테스트                             │
  │    npm test → 결과 확인                     │
  │                                            │
  │  Step 3: Pre-landing 리뷰                   │
  │    에이전트: code-reviewer                   │
  │    main 대비 diff 전체 리뷰                  │
  │                                            │
  │  Step 4: 버전 범프 + CHANGELOG              │
  │    에이전트: git-master                      │
  │    semver 자동 결정 + CHANGELOG 생성         │
  │                                            │
  │  Step 5: 커밋 + PR                          │
  │    에이전트: git-master                      │
  │                                            │
  │  Step 6: Compound-Out                       │
  │    릴리스 이슈 발생 시 기록                  │
  └────────────────────────────────────────────┘
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 리뷰 | `/ship` (내부) | code-reviewer | In: 이전 릴리스 이슈 |
| 버전 | `/ship` (내부) | git-master | - |
| 학습 | `/ship` (내장) | - | Out: 릴리스 이슈 기록 |

---

## S5. 빠른 수정 (핫픽스) — "오타 고쳐줘"

**상황**: 단순 수정. 복잡한 워크플로우 불필요.

### 흐름

```
사용자: "README에 오타 있어. 수정해줘"
         │
         ▼
  ┌─ 일반 대화 (스킬 불필요) ──────────────────┐
  │  Claude Code가 직접 처리                     │
  │  에이전트 위임 없음                          │
  │  compound 검색 없음 (solution-injector가     │
  │  "readme 오타"로는 유의미한 매칭 없음)        │
  │                                            │
  │  Read → Edit → 완료                         │
  └────────────────────────────────────────────┘
```

**핵심**: **아무 스킬도 활성화되지 않는다**. forgen이 모든 것에 개입하면 오버헤드. 단순 작업은 Claude Code 네이티브로 처리. compound solution-injector는 매칭 없으면 조용히 패스.

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 수정 | 없음 | 없음 | 매칭 없음 → 패스 |

---

## S6. 리팩토링 — "이 모듈 정리 좀 해줘"

**상황**: 기존 코드의 구조 개선.

### 흐름

```
사용자: "src/engine/ 디렉토리 정리해줘. 너무 복잡해"
         │
         ▼
  ┌─ /forge-loop ──────────────────────────────┐
  │  Compound-In:                               │
  │    compound-search "refactor engine"        │
  │    → "이전 리팩토링 패턴:"                   │
  │      - "extract-module-boundary-pattern"    │
  │      - "barrel-export-antipattern"          │
  │                                            │
  │  planner가 작업 분해:                        │
  │    S1: 현재 구조 분석 (explore)              │
  │    S2: 의존성 그래프 파악 (explore)           │
  │    S3: 모듈 경계 재설계 (architect)           │
  │    S4: 파일 이동 + import 수정 (executor)    │
  │    S5: 테스트 통과 확인 (verifier)            │
  │                                            │
  │  architect가 /architecture-decision 활용:    │
  │    ADR 작성 → compound에 저장               │
  │                                            │
  │  executor가 구현:                            │
  │    compound 힌트: "barrel export 쓰지 말 것" │
  │    → 이전 안티패턴 회피                      │
  │                                            │
  │  전체 완료 후 critic 리뷰                    │
  └────────────────────────────────────────────┘
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 계획 | `/forge-loop` | planner, explore | In: 이전 리팩토링 패턴 |
| 설계 | `/architecture-decision` | architect | In+Out: ADR 기록 |
| 구현 | `/forge-loop` | executor | In: 안티패턴 회피 |
| 검증 | `/forge-loop` | verifier, critic | - |

---

## S7. 새 프로젝트 온보딩 — "이 코드베이스 파악해줘"

**상황**: 처음 보는 프로젝트에 투입.

### 흐름

```
사용자: "이 프로젝트 구조 파악하고 정리해줘"
         │
         ▼
  ┌─ 일반 대화 ────────────────────────────────┐
  │  에이전트: explore (Haiku, 빠른 탐색)        │
  │    디렉토리 구조 스캔                        │
  │    package.json / go.mod 등 분석            │
  │    README, 아키텍처 문서 읽기                │
  │                                            │
  │  에이전트: analyst (Opus, 깊은 분석)         │
  │    진입점 파악                               │
  │    핵심 데이터 흐름 추적                     │
  │    의존성 그래프 파악                        │
  │                                            │
  │  Compound-In:                               │
  │    compound-search "이 프로젝트" (scope:proj)│
  │    → 이전에 이 프로젝트에서 축적한 솔루션 로드│
  │    → "이 프로젝트의 주요 패턴:" 표시          │
  └────────────────────────────────────────────┘
         │
         ▼
  ┌─ /compound (수동) ─────────────────────────┐
  │  탐색 결과를 compound에 기록:                │
  │  - "project-architecture-overview"          │
  │  - "key-entry-points"                       │
  │  - "common-gotchas"                         │
  │  → 다음에 이 프로젝트 온보딩 시 즉시 활용    │
  └────────────────────────────────────────────┘
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 탐색 | 없음 | explore | In: 이전 프로젝트 지식 |
| 분석 | 없음 | analyst | - |
| 기록 | `/compound` (수동) | - | Out: 프로젝트 지식 축적 |

---

## S8. 주간 회고 — "이번 주 어땠나 보자"

**상황**: 주말 또는 주초, 지난 주 작업을 돌아봄.

### 흐름

```
사용자: "retro" 또는 "이번 주 회고하자"
         │
         ▼
  ┌─ /retro ───────────────────────────────────┐
  │  데이터 수집:                                │
  │    git log --since="7 days ago"             │
  │    compound stats                           │
  │    session quality scores                   │
  │                                            │
  │  분석 결과:                                  │
  │                                            │
  │  WEEKLY RETRO                               │
  │  ════════════                               │
  │  커밋: 23개 | +1,847 / -523                 │
  │  핫스팟: compound-lifecycle.ts (7회 수정!)   │
  │                                            │
  │  COMPOUND HEALTH                            │
  │  총 47개 | 활용률 28%                        │
  │  Stale 후보: 8개                            │
  │  → "/learn prune 실행 추천"                  │
  │                                            │
  │  LEARNING TREND                             │
  │  교정: 12→8→5 (↓ 학습 중)                   │
  │  드리프트: 0회                               │
  │                                            │
  │  RECOMMENDATIONS                            │
  │  1. compound-lifecycle.ts 7회 수정           │
  │     → 구조 리뷰 필요 (/code-review 추천)    │
  │  2. stale 8개 정리 (/learn prune)           │
  │  3. 교정 감소 추세 유지 — 프로필 적절        │
  └────────────────────────────────────────────┘
         │
         ▼
  사용자가 추천에 따라:
    → /learn prune (S10으로)
    → /code-review compound-lifecycle.ts (S3으로)
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 분석 | `/retro` | 없음 | 전체 통계 분석 |
| 후속 | `/learn`, `/code-review` | 상황별 | 추천 기반 |

---

## S9. 프로필 보정 — "내 설정 맞나 확인해봐"

**상황**: 한 달쯤 사용 후, Claude가 자신을 잘 이해하는지 확인.

### 흐름

```
사용자: "calibrate" 또는 "프로필 확인해봐"
         │
         ▼
  ┌─ /calibrate ───────────────────────────────┐
  │  evidence 로드:                             │
  │    ~/.forgen/me/evidence/*.json             │
  │                                            │
  │  축별 분석:                                  │
  │                                            │
  │  PROFILE CALIBRATION                        │
  │  ═══════════════════                        │
  │  현재: quality=균형 | autonomy=자율          │
  │        judgment=최소변경 | comm=간결         │
  │                                            │
  │  교정 분석 (최근 30일):                      │
  │    quality: "확인 더 해줘" 3건               │
  │      → 보수형으로 변경 제안                  │
  │    autonomy: 교정 0건 → 유지                 │
  │    judgment: 교정 1건 → 유지                 │
  │    comm: "코드 보여줘" 2건 → 유지            │
  │                                            │
  │  적용? [Y/n/커스텀]                          │
  └────────────────────────────────────────────┘
         │
         ▼
  사용자: "Y"
  → forge-profile.json 업데이트
  → 다음 세션부터 검증 깊이 강화
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 분석 | `/calibrate` | 없음 | Evidence 기반 분석 |

---

## S10. Compound 정리 — "솔루션 정리하자"

**상황**: retro에서 추천받거나, 직접 정리 필요 느낌.

### 흐름

```
사용자: "learn prune" 또는 "compound 정리"
         │
         ▼
  ┌─ /learn prune ─────────────────────────────┐
  │  자동 감지:                                  │
  │                                            │
  │  PRUNE CANDIDATES                           │
  │  ═══════════════                            │
  │                                            │
  │  STALE (30일+ 미사용):                       │
  │    1. "webpack-chunk-split-pattern" (45일)   │
  │       → [retire / keep]                     │
  │    2. "jest-mock-timer-pattern" (38일)       │
  │       → [retire / keep]                     │
  │                                            │
  │  DUPLICATE (유사도 85%+):                    │
  │    3. "prisma-upsert-pattern"               │
  │       ≈ "prisma-create-or-update" (87%)     │
  │       → [merge / keep both]                 │
  │                                            │
  │  LOW-QUALITY (experiment 60일+):            │
  │    4. "vague-optimization-hint" (72일)       │
  │       → [retire / promote / keep]           │
  │                                            │
  │  사용자 선택 후 실행                         │
  └────────────────────────────────────────────┘
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 정리 | `/learn` | 없음 | 전체 관리 |

---

## S11. 스킬 자동 추출 — (세션 종료 시 자동)

**상황**: 긴 디버깅 세션 후 자동으로 동작.

### 흐름

```
[세션 종료 시 auto-compound-runner가 자동 실행]
         │
         ▼
  ┌─ 자동 분석 ────────────────────────────────┐
  │  세션 트랜스크립트 분석:                      │
  │    - 20+ 프롬프트 세션                       │
  │    - 3회 이상 시도 후 해결한 이슈 감지        │
  │                                            │
  │  품질 게이트:                                │
  │    "5분 안에 구글링 가능?" → No ✓            │
  │    "이 코드베이스 특정?" → Yes ✓             │
  │    "실제 디버깅 노력?" → Yes ✓              │
  │                                            │
  │  추출:                                      │
  │    compound solution: 자동 저장              │
  │    skill 후보: .forgen/skills/ 에 초안 저장  │
  │    → 다음 세션에서 "새 스킬 발견:" 알림      │
  └────────────────────────────────────────────┘
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 추출 | 없음 (자동) | 없음 | Out: 솔루션 + 스킬 자동 추출 |

---

## S12. 크로스 프로젝트 학습 — "다른 프로젝트 패턴 가져오기"

**상황**: 프로젝트 A에서 배운 패턴을 프로젝트 B에 적용.

### 흐름

```
[프로젝트 B에서 작업 중]
         │
         ▼
  ┌─ Compound-In (자동) ───────────────────────┐
  │  solution-injector가 scope:me + universal   │
  │  솔루션을 자동 검색                          │
  │                                            │
  │  프로젝트 A에서 축적한 솔루션 중             │
  │  scope:me인 것이 매칭됨:                     │
  │    "vitest-mock-module-pattern"             │
  │    (프로젝트 A에서 3회 사용, mature)          │
  │                                            │
  │  → 프로젝트 B에서도 자동 주입                │
  └────────────────────────────────────────────┘
         │
         ▼
  [meta-learning scope-promoter 동작]
  이 솔루션이 3+ 프로젝트에서 사용되면:
    scope:me → scope:universal 자동 승격
```

| 단계 | 스킬 | 에이전트 | compound 역할 |
|------|------|---------|-------------|
| 자동 | 없음 | 없음 | In: 크로스 프로젝트 솔루션 주입 |
| 승격 | 없음 (meta-learning) | 없음 | scope 승격 |

---

## 시나리오 × 스킬 매트릭스 (최종 10개 스킬 반영)

```
                    deep-    forge-  archi-  code-              cali-
            compound interview loop   ship  review  docker retro learn brate  tect-dec
            ──────── ───────── ────── ───── ────── ────── ───── ───── ───── ─────────
S1.새기능      ◉        ◉       ◉                                                    
S2.버그수정    ○                                                                      
S3.코드리뷰                                   ◉                                      
S4.릴리스                              ◉                                              
S5.핫픽스                                                                             
S6.리팩토링    ○                 ◉             ○                              ○      
S7.온보딩      ○                                                                      
S8.주간회고                                                       ◉     ○            
S9.프로필보정                                                                    ◉   
S10.정리                                                                ◉            
S11.자동추출   ◉                                                                      
S12.크로스                                                                            

◉ = 주요 스킬  ○ = 보조/선택적  빈칸 = 미사용

참고: ultrawork(연기됨)와 ci-cd(삭제됨)는 매트릭스에서 제거.
      architecture-decision(tect-dec)과 docker를 추가 반영.
```

### 핵심 발견

1. **가장 많이 쓰이는 스킬**: `/forge-loop` (S1, S6) + `/compound` (S1, S2, S6, S7, S11)
2. **단독으로 완결되는 스킬**: `/retro`, `/calibrate`, `/learn` — 관리 도구
3. **체인으로 연결되는 스킬**: deep-interview → forge-loop → compound (S1 풀 체인)
4. **스킬 없이 동작하는 시나리오**: S2(버그), S5(핫픽스), S7(온보딩), S11(자동), S12(크로스) — **compound 훅이 자동으로 일함**
5. **빠진 시나리오**: 없음. 10개 스킬이 12개 시나리오를 커버 (ultrawork 연기, ci-cd 삭제 후에도 커버리지 유지)

### Compound 학습 효과 요약

| 시나리오 | 1회차 | 2회차 | 개선 |
|---------|------|------|------|
| S1. 새 기능 | 5라운드 인터뷰, 12반복 | 3라운드, 6반복 | **50% 시간 절감** |
| S2. 버그 수정 | 0 힌트, 시행착오 | 유사 이슈 힌트 자동 | **즉시 원인 특정** |
| S3. 코드 리뷰 | 기본 체크리스트 | 이전 이슈 패턴 경고 | **반복 버그 방지** |
| S4. 릴리스 | 기본 파이프라인 | 이전 이슈 사전 체크 | **릴리스 실패 방지** |
| S7. 온보딩 | 전체 탐색 필요 | 축적된 프로젝트 지식 | **온보딩 시간 단축** |

---

## 스킬 간 의존성 그래프 (최종 10개 반영)

```
/deep-interview ──→ /forge-loop ──→ /compound
     │                   │              │
     │                   ├──→ /ship     │
     │                   │              │
     └── (독립) ────────────────────────┘
                         │
/retro ─────────────→ /learn ──→ /calibrate
                         │
/code-review (독립)      │
/docker (독립)           │
/architecture-decision (독립, compound ADR 연동)
```

- **핵심 체인**: deep-interview → forge-loop → compound
- **관리 체인**: retro → learn → calibrate
- **독립 스킬**: code-review, docker, architecture-decision (단독 사용)
- ~~ultrawork~~: 연기됨 — forge-loop 내부에서 병렬 단계로 처리
- ~~ci-cd~~: 삭제됨 — compound 연동 약함
