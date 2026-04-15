# Forgen 약점 심층 분석서

> 작성일: 2026-04-14
> 최종 업데이트: 2026-04-14 (구현 결과 반영)
> 비교 대상: OMC(28.5K), gstack(71.8K), OpenCode(142.8K), oh-my-openagent(51.4K), ECC(155K), claude-mem(53.9K), GSD(52.3K)
> 분석 방법: 각 프로젝트 소스코드 + README + 아키텍처 문서 교차 분석

---

## Resolution Status (2026-04-14 구현 완료)

| # | 약점 | 상태 | 구현 내용 |
|:-:|------|:----:|----------|
| 1 | 스킬 품질 (21개 → 10개) | ✅ 구현 완료 | 16개 삭제, 5개 유지+강화, 5개 신규. 최종 10개 스킬 |
| 2 | 플러그인 체계 부재 | ✅ 구현 완료 | `.forgen/skills/` 스캔 경로 추가 (skill-injector.ts) |
| 3 | 완료까지 루프 | ✅ 구현 완료 | `/forge-loop` (182줄) — PRD 구조, Anti-Polite-Stop, Verifier 강제, circuit breakers |
| 4 | 에이전트 정리 (19개 → 12개) | ✅ 구현 완료 | 7개 삭제, 전체 12개에 Failure_Modes_To_Avoid, Examples, Success_Criteria, maxTurns, color 추가. tier/lane 제거 |
| 5 | compound 효과 증명 | ⏳ 진행 중 | Learning Dashboard, Session Summary는 📋 TODO |
| 6 | Progressive Disclosure | ⏳ 진행 중 | 부분 개선만 (rule-renderer 4000자 캡 유지) |
| 7 | 훅 성능 | 📋 TODO | bridge 패턴 미적용 |
| 8 | 스킬 자동 추출 (learner) | ✅ 구현 완료 | `/learn` (216줄) — 5 서브커맨드, prune/export/import, stats |
| 9 | 병렬 실행 | ❌ 제외됨 | `ultrawork` 연기. forge-loop 내부에서 병렬화 처리 |
| 10 | 비용/토큰 추적 | 📋 TODO | |
| 11 | stuck loop 감지 | 📋 TODO | |
| 12 | context rot 방지 | 📋 TODO | |

### 킬러 스킬 구현 결과

| 후보 | 상태 | 실제 구현 (줄 수) |
|------|:----:|-----------------|
| `/forge-loop` (ralph 대응) | ✅ 구현 완료 | 182줄 — PRD 구조, Anti-Polite-Stop, Verifier 강제, circuit breakers |
| `/ship` | ✅ 구현 완료 | 259줄 — 15단계 파이프라인, "never ask just do", Review Readiness Dashboard, Verification Gate |
| `/retro` | ✅ 구현 완료 | 199줄 — 세션 패턴 분석, compound health 3-tier, compare 모드 |
| `/learn` | ✅ 구현 완료 | 216줄 — 5 서브커맨드 (search/prune/export/import/stats), stats 시각화 |
| `/calibrate` | ✅ 구현 완료 | 207줄 — 정량적 프로토콜, evidence 교차 검증, direction scoring |
| `/ultrawork` | ❌ 제외됨 | 연기됨 — forge-loop 내부에서 병렬 단계로 처리 |

### 코드 변경 요약

- **keyword-detector.ts**: 9개 구 패턴 삭제, 5개 신규 추가 (forge-loop, ship, retro, learn, calibrate), 8개 INJECT_MESSAGES 삭제
- **skill-injector.ts**: `.forgen/skills/` 스캔 경로 추가 (플러그인 시스템)
- **테스트**: 1531/1531 통과

---

## 1. 시장 포지션

```
Stars (2026-04-14)
ECC            ████████████████████████████████████████  155K
OpenCode       ████████████████████████████████████      142K
gstack         ██████████████████                         72K
claude-mem     █████████████                              54K
GSD            █████████████                              52K
oh-my-openagent █████████████                             51K
OMC            ███████                                    29K
forgen         ▏                                           0K
```

forgen의 핵심 차별점(compound learning, meta-learning, evidence 교정)은 시장에서 유일하지만,
사용자에게 도달하지 못하면 존재하지 않는 것과 같다.

---

## 2. 약점 상세 분석

### 2.1 [CRITICAL] 스킬 품질 — 21개 중 실질 가치 3개 ✅ 해결됨

> **해결 상태 (2026-04-14)**: 21개 → 10개로 정리 완료. 16개 삭제, 5개 유지+강화, 5개 신규 킬러 스킬 구현.

#### 구현 전 상태 (아래는 원본 분석)

| 등급 | 스킬 | 이유 | 조치 결과 |
|------|------|------|----------|
| **진짜 가치** | `compound`, `deep-interview`, `architecture-decision` | Claude Code에 없는 고유 기능 | ✅ 유지 + 강화 |
| **있으나마나** | `api-design`, `database`, `frontend`, `docker`, `ci-cd`, `security-review`, `incident-response`, `performance`, `debug-detective`, `code-review`, `migrate` | 체크리스트 수준 | ✅ `code-review`, `docker` 유지 + 강화. 나머지 9개 삭제 |
| **제거 후보** | `refactor`, `tdd`, `testing-strategy`, `documentation`, `git-master`, `ecomode`, `specify` | 일반론 반복 | ✅ 전부 삭제 |

#### 경쟁자 비교

| 도구 | 스킬 수 | 킬러 스킬 |
|------|------:|----------|
| **ECC** | 181 | Instinct system (학습→스킬 자동 진화) |
| **gstack** | 36 | `/qa`(브라우저 테스트), `/design-shotgun`(AI 디자인), `/ship`(완전 자동 출시), `/office-hours`(YC 진단) |
| **OMC** | 35 | `ralph`(완료까지 루프), `ultrawork`(최대 병렬), `deep-interview`(수학적 모호성 게이팅), `ccg`(3모델 합성) |
| **oh-my-openagent** | 20+ | Hashline edit(편집 정확도 10x), category routing(작업→모델 자동 매칭) |
| **forgen** | 21 | `compound`(유일), 나머지는 체크리스트 |

#### 문제의 본질

forgen 스킬의 대다수는 **"교과서를 마크다운으로 포장한 것"**. Claude Opus/Sonnet은 이런 체크리스트를 프롬프트 한 줄로 생성할 수 있다. 반면 경쟁자들의 킬러 스킬은:

- **gstack `/qa`**: 실제 Playwright 브라우저 데몬이 돌면서 클릭/스크린샷/버그 수정을 한다
- **OMC `ralph`**: Stop 훅으로 물리적으로 중단을 방지하고, PRD의 모든 User Story가 passes:true가 될 때까지 반복한다
- **oh-my-openagent Hashline**: xxHash32 기반 내용 주소 지정으로 줄 드리프트 문제를 근본적으로 해결한다

이들은 **프롬프트가 아니라 엔지니어링**으로 가치를 만든다.

#### 없어서 뼈아픈 스킬 — 구현 현황

| 없는 스킬 | 누가 가지고 있나 | 왜 필요한가 | 구현 상태 |
|----------|--------------|----------|----------|
| **완료까지 루프** (ralph) | OMC, oh-my-openagent | Stop 훅으로 강제 지속 | ✅ `/forge-loop` (182줄) |
| **브라우저 QA** | gstack | 프론트엔드 실제 검증 | ❌ 제외 (gstack 영역) |
| **디자인→코드** | gstack | AI 모킹업 파이프라인 | ❌ 제외 (gstack 영역) |
| **크로스-AI 리뷰** | gstack, OMC | 단일 모델 편향 방지 | ❌ 제외 (Claude 전용 정체성) |
| **자동 출시** (ship) | gstack | 원커맨드 릴리스 | ✅ `/ship` (259줄) |
| **병렬 실행** (ultrawork) | OMC, oh-my-openagent | 독립 작업 동시 발사 | ❌ 제외 (forge-loop 내부 처리) |
| **스킬 자동 추출** (learner) | OMC, gstack | 디버깅 지식 재사용 | ✅ `/learn` (216줄) |
| **세션 간 학습 관리** | gstack `/learn` | 검색, 가지치기, 내보내기 | ✅ `/learn` (5 서브커맨드) |
| **주간 회고** (retro) | gstack | 커밋 분석 + 품질 추세 | ✅ `/retro` (199줄) |
| **프로젝트 초기화** | oh-my-openagent `/init-deep` | 계층적 AGENTS.md 자동 생성 | 📋 TODO |

---

### 2.2 [CRITICAL] 에이전트 품질 — 19개 중 구조적 문제 ✅ 해결됨

> **해결 상태 (2026-04-14)**: 19개 → 12개로 정리 완료. 7개 삭제, 전체 12개에 Failure_Modes_To_Avoid, Examples (Good/Bad), Success_Criteria, maxTurns, color 속성 추가. 기존 tier/lane 메타데이터 제거.

#### 현재 상태

**읽기전용 에이전트 과다**: 19개 중 8개가 코드를 읽기만 한다.

```
읽기전용 (8개): analyst, architect, code-reviewer, critic, explore,
                performance-reviewer, security-reviewer, verifier(부분)

쓰기 가능 (11개): code-simplifier, debugger, designer, executor,
                  git-master, qa-tester, refactoring-expert, scientist,
                  test-engineer, writer, planner
```

"보안 관점에서 리뷰해줘"라고 직접 지시하면 security-reviewer 에이전트와 동등한 결과를 얻는다.

#### 역할 중복

```
요구사항 파악:  analyst ≈ planner ≈ critic (부분)
코드 리뷰:     code-reviewer ≈ security-reviewer ≈ performance-reviewer
코드 수정:     executor ≈ refactoring-expert ≈ code-simplifier
```

#### 프롬프트 품질 편차

| 등급 | 에이전트 | 프롬프트 줄 수 | 평가 |
|------|---------|:-----------:|------|
| 높음 | analyst, code-reviewer, debugger, critic | 80-120줄 | Socratic 프로토콜, 체크 항목, 출력 포맷 명확 |
| 중간 | architect, explorer, code-simplifier | 40-60줄 | 역할은 명확하나 프레임워크 부족 |
| 낮음 | **planner (25줄), executor (35줄)** | 25-35줄 | 너무 짧아서 범용적 지시밖에 안 됨 |

핵심 실행 에이전트(planner, executor)의 프롬프트가 가장 빈약하다는 것이 문제.

#### 경쟁자 에이전트 비교

| 도구 | 에이전트 수 | 핵심 차별점 |
|------|:--------:|----------|
| **ECC** | 47 | 에이전트별 Failure Modes 명시, 자동 에스컬레이션 |
| **OMC** | 19 | 4-Lane 조직(Build/Review/Domain/Coordination), 역할 경계 물리적 분리(도구 차단) |
| **oh-my-openagent** | 11 | **모델별 프롬프트 분기** (같은 에이전트가 Claude/GPT/Gemini별로 다른 프롬프트) |
| **OpenCode** | 7 | Effect-TS 기반 DI, Permission.Ruleset으로 도구 접근 제어 |
| **forgen** | 19 | 수는 같으나 역할 중복, 프롬프트 품질 편차 |

**OMC의 핵심 설계 원칙** (forgen에 없는 것):
1. **역할 경계의 물리적 분리**: architect는 Write/Edit 도구 자체가 차단됨
2. **Anti-pattern 명시적 문서화**: 각 에이전트에 `<Failure_Modes_To_Avoid>` 섹션 존재
3. **증거 기반 검증**: 모든 에이전트가 `file:line` 레퍼런스 필수. "should work" 같은 추측 금지

---

### 2.3 [CRITICAL] 플러그인/확장 체계 부재 ✅ 해결됨

> **해결 상태 (2026-04-14)**: `.forgen/skills/` 스캔 경로가 skill-injector.ts에 추가됨. 사용자 커스텀 스킬 로딩 가능.

#### 경쟁자 확장 시스템

| 도구 | 확장 방식 | 커스텀 스킬 추가 |
|------|----------|--------------|
| **OpenCode** | `@opencode-ai/plugin` SDK (npm 패키지) | `.opencode/skills/**/*.md` |
| **gstack** | SKILL.md + SKILL.md.tmpl 템플릿 시스템 | `~/.claude/skills/` 디렉토리 |
| **OMC** | `.claude-plugin/` 매니페스트 + marketplace | `.omc/skills/` (프로젝트) + `~/.omc/skills/` (글로벌) |
| **oh-my-openagent** | OpenCode plugin 인터페이스 | AGENTS.md + SKILL.md |
| **forgen** | **없음** | **없음** (소스 포크 필요) |

gstack의 SKILL.md 포맷은 특히 우아하다:
```yaml
---
name: skill-name
preamble-tier: 1-4          # 프리앰블 복잡도 (1=최소, 4=풀)
version: 1.0.0
description: |
  Use when asked to "..."
  Voice triggers: "..."
allowed-tools:
  - Bash
  - Read
benefits-from: [office-hours]  # 선행 스킬 의존성
---
```

그리고 **SKILL.md.tmpl 템플릿 시스템**: 공통 프리앰블/브라우저 설정/명령어 레퍼런스를 플레이스홀더로 관리하여 DRY 원칙 준수.

---

### 2.4 [HIGH] 오케스트레이션 엔진 부재 ✅ 부분 해결

> **해결 상태 (2026-04-14)**: `/forge-loop` (182줄)이 PRD 기반 완료까지 루프를 구현. OMC ralph 수준의 완전한 오케스트레이션은 아니지만, Anti-Polite-Stop + Verifier 강제 + circuit breakers로 기본 오케스트레이션 제공.

#### 경쟁자 오케스트레이션 모드

**OMC (8개 모드)**:
| 모드 | 메커니즘 |
|------|---------|
| `ralph` | Stop 훅에서 "The boulder never stops" 주입 → 물리적 중단 방지. PRD의 모든 User Story passes:true까지 |
| `ultrawork` | 독립 작업 동시 발사 + 모델 티어 자동 라우팅 |
| `team` | N개 에이전트 파이프라인 (plan→prd→exec→verify→fix) |
| `autopilot` | 아이디어→작동 코드까지 5단계 자율 실행 |
| `ralplan` | Planner+Architect+Critic 합의까지 계획 반복 |
| `ccg` | Claude+Codex+Gemini 3모델 합성 어드바이저 |
| `deep-interview` | 수학적 모호성 20% 이하까지 소크라테스식 질문 |
| `self-improve` | 토너먼트 선택 방식 자율 코드 개선 |

**gstack**:
| 모드 | 메커니즘 |
|------|---------|
| `/autoplan` | CEO→디자인→엔지니어링→DX 리뷰 순차 자동 |
| `/ship` | 테스트→리뷰→버전범프→커밋→PR 10단계 자동 |
| `/qa` | 브라우저 탐색→스냅샷→조작→검증 루프 |
| `/pair-agent` | 다른 AI 에이전트에 보안 격리된 브라우저 공유 |

**forgen**: 없음. Claude Code의 Agent 도구에 100% 의존.

---

### 2.5 [HIGH] Progressive Disclosure 부재 ⏳ 진행 중

#### 현재: 매 세션 40+ 파일 복사

```
하네스 시작 시:
├── agents/ → .claude/agents/    (19개 파일 복사)
├── skills/ → .claude/commands/  (21개 파일 복사)
├── rules/ → .claude/rules/      (2개 파일 생성)
└── hooks 등록                    (hooks.json 갱신)
```

#### 경쟁자 접근

| 도구 | 컨텍스트 관리 |
|------|-------------|
| **gstack** | `preamble-tier: 1-4`로 프리앰블 복잡도 제어. 메타데이터만 노출, 선택 시 전문 로드 |
| **OMC** | 모델 라우팅으로 단순 작업은 Haiku, 복잡 분석은 Opus → 30-50% 토큰 절약 |
| **claude-mem** | 3-layer progressive disclosure: 인덱스(50-100 토큰) → 타임라인 → 전체(10x 절약) |
| **forgen** | rule-renderer.ts에서 4000자 예산 캡만. 스킬/에이전트는 전량 파일시스템 복사 |

---

### 2.6 [HIGH] Compound 효과 정량 증명 부재 📋 TODO

forgen의 핵심 가치인 compound learning이 **"실제로 효과가 있다"는 증거가 없다**.

#### 현재 측정 체계
- `solution-writer.ts`: evidence 카운터 증가
- `compound-reflection.ts`: 15분 윈도우 내 50% 식별자 매칭으로 "사용됨" 판정
- `session-quality-scorer.ts`: 교정 횟수, 드리프트, 리버트, 솔루션 효과의 복합 점수

#### 없는 것
- **A/B 측정**: compound 주입 시 vs 미주입 시 세션 품질 비교
- **사용자 대시보드**: "이번 달 compound가 당신의 작업을 X% 가속했습니다"
- **ROI 지표**: compound 축적에 소비된 토큰 vs 절약된 시간의 비율
- **cc-switch 수준의 비용 추적**: 세션별/compound별 토큰 소비 추적

**ECC의 Instinct System이 이미 유사한 문제를 해결하고 있다**: confidence scoring + evolution tracking으로 패턴의 성숙도를 정량적으로 추적. forgen의 compound lifecycle (experiment → candidate → verified → mature)과 개념은 같지만, ECC는 "자동 승격"을 더 강하게 밀어붙인다.

---

### 2.7 [HIGH] 훅 성능 오버헤드 📋 TODO

#### 현재: UserPromptSubmit에 6개 훅

매 프롬프트마다 6개의 Node.js 프로세스가 스폰:
```
UserPromptSubmit 훅 (매번 실행):
1. notepad-injector     → Node spawn + 파일 I/O
2. context-guard        → Node spawn + 파일 I/O + 대화 길이 계산
3. intent-classifier    → Node spawn + regex 매칭
4. keyword-detector     → Node spawn + 키워드 매칭
5. solution-injector    → Node spawn + TF-IDF/BM25 매칭 + 파일 I/O
6. skill-injector       → Node spawn + 트리거 매칭
```

#### 경쟁자 접근

| 도구 | 훅 실행 전략 |
|------|-------------|
| **claude-code-harness** | Go 네이티브 바이너리: **500-800ms → 10-30ms** (25x 개선) |
| **OMC** | 단일 bridge.ts 프로세스가 모든 훅 라우팅 |
| **oh-my-openagent** | 훅별 독립 실행이지만 Bun 런타임으로 cold start 최소화 |

---

### 2.8 [MEDIUM] Solution Matcher 의미론적 한계 📋 TODO

#### 현재: TF-IDF + BM25 + bigram 앙상블

텍스트 매칭에 한정. "API 응답 캐싱" → "HTTP 결과를 메모리에 저장" 매칭 불가.

#### 경쟁자 접근

| 도구 | 검색 방식 |
|------|----------|
| **claude-mem** | SQLite FTS5 + **Chroma 벡터 DB** 하이브리드 |
| **ECC** | confidence scoring + 구조화된 인덱스 |
| **gstack** | 키워드 기반이지만, 모든 스킬에서 `learnings-search --limit 3`으로 사전 매칭 |
| **claude-memory-compiler** | "50-500 articles 규모에서는 벡터 DB보다 LLM이 구조화된 인덱스를 직접 읽는 게 더 정확" |

**시사점**: forgen의 현재 compound 규모(수십~수백 솔루션)에서는 벡터 DB 도입보다 **구조화된 인덱스 + LLM 직접 읽기**(claude-memory-compiler 방식)가 적절할 수 있다. 그러나 규모가 커지면 의미론적 검색이 필수.

---

### 2.9 [MEDIUM] 하드코딩된 임계값 📋 TODO

| 위치 | 값 | 문제 |
|------|-----|------|
| `drift-score.ts` | 15/30/50 edits | 프로젝트 규모별 차이 무시 |
| `rule-renderer.ts` | 4000자 예산 | 모델/컨텍스트 크기에 무관 |
| `context-guard.ts` | 50 prompts / 200K chars | 경험적 수치, 검증 없음 |
| `compound-reflection.ts` | 15분 윈도우, 50% 매칭 | 근거 불명 |
| `solution-injector.ts` | 세션당 최대 10개 주입 | 고정 |
| `rate-limiter.ts` | 분당 30회 MCP 호출 | 고정 |

Meta-learning의 `adaptive-thresholds.ts`가 일부를 동적으로 만들려 하지만, **기본 비활성화**이고 대부분은 여전히 매직 넘버.

---

### 2.10 [MEDIUM] 멀티모델/멀티호스트 미지원 ❌ 제외 (설계 결정)

| 도구 | 모델 지원 |
|------|----------|
| **OpenCode** | 22개 프로바이더 (Anthropic, OpenAI, Gemini, Bedrock, 로컬 등) |
| **oh-my-openagent** | Claude + GPT-5.4 + Kimi K2.5 + GLM-5 + Gemini (에이전트별 fallback chain) |
| **gstack** | Claude + Codex + Cursor + Kiro + OpenCode + Slate + OpenClaw (8개 호스트) |
| **OMC** | Claude + Codex + Gemini (CCG 합성) |
| **forgen** | **Claude Code 전용** (실험적 Codex 어댑터만, 테스트 없음) |

---

### 2.11 [MEDIUM] 테스트/품질 인프라 ⏳ 진행 중

> **현재 상태 (2026-04-14)**: 테스트 1531/1531 통과. LLM 평가/벤치마크는 여전히 없음.

| 도구 | 테스트 파일 | 특수 테스트 |
|------|--------:|----------|
| **OMC** | 2,438개 | 벤치마크 시스템, CI 5-job, 커밋 프로토콜 (Constraint/Confidence 트레일러) |
| **gstack** | 82개 | LLM eval 테스트 ($4/실행), 2-tier gate/periodic, slop-scan |
| **OpenCode** | 152개 | JUnit 리포트, bun test, 30초 타임아웃 |
| **forgen** | ~120개 | Docker e2e 있으나 수동적, LLM 평가/벤치마크 없음 |

---

## 3. 약점 해소 우선순위

### Tier 1: 즉시 착수 (생존에 필수) ✅ 전부 완료

| # | 약점 | 해결 방향 | 참고 | 상태 |
|:-:|------|----------|------|:----:|
| 1 | **스킬 품질** | 21→10개 정리 + 킬러 스킬 5개 신규 | gstack `/ship`, OMC `ralph` | ✅ |
| 2 | **플러그인 체계** | `.forgen/skills/*.md` 커스텀 스킬 로딩 | gstack SKILL.md 포맷 | ✅ |
| 3 | **완료까지 루프** | Stop 훅 + PRD 기반 지속 모드 | OMC ralph | ✅ |
| 4 | **에이전트 정리** | 19→12개. 중복 통합 + 핵심 프롬프트 강화 | OMC 4-Lane 모델 | ✅ |

### Tier 2: 단기 (경쟁력 확보) — 부분 완료

| # | 약점 | 해결 방향 | 참고 | 상태 |
|:-:|------|----------|------|:----:|
| 5 | **compound 효과 증명** | A/B 세션 비교 + 대시보드 | ECC instinct scoring | 📋 TODO |
| 6 | **Progressive Disclosure** | preamble-tier + 지연 로딩 | gstack, claude-mem | ⏳ |
| 7 | **훅 성능** | bridge 패턴으로 단일 프로세스화 | OMC bridge.ts | 📋 TODO |
| 8 | **스킬 자동 추출** | 세션→스킬 변환 learner | OMC learner, gstack `/learn` | ✅ `/learn` 구현 |

### Tier 3: 중기 (차별화 강화) — 대부분 미착수

| # | 약점 | 해결 방향 | 참고 | 상태 |
|:-:|------|----------|------|:----:|
| 9 | **병렬 실행** | ultrawork 기본형 | OMC ultrawork | ❌ 연기 |
| 10 | **비용/토큰 추적** | 세션별 토큰 소비 기록 | cc-switch, GSD | 📋 TODO |
| 11 | **stuck loop 감지** | auto-compound에 무한 루프 탐지 | GSD-2 | 📋 TODO |
| 12 | **context rot 방지** | 태스크 단위 fresh context | GSD | 📋 TODO |

### 안 건드림 (게임이 다름)

| 약점 | 이유 |
|------|------|
| 멀티모델 22개 | forgen은 Claude Code 하네스. OpenCode가 되려고 하면 정체성 상실 |
| 브라우저 자동화 | gstack 영역. Playwright 데몬을 따라 만들면 열화판 |
| Stars/커뮤니티 | 엔지니어링으로 해결할 문제가 아님 |
| 멀티호스트 8개 | Codex 어댑터 하나면 충분. 유지보수 지옥 |
| LSP 통합 31개 | OpenCode 영역. Claude Code 자체에 LSP가 없음 |

---

## 4. 킬러 스킬 후보 (신규 개발) — 구현 결과

> 아래 후보 중 5개가 구현 완료, 1개가 연기됨. `/ralph`은 `/forge-loop`으로 이름을 변경하여 구현.

### 4.1 `/ralph` → `/forge-loop` — 완료까지 루프 ✅ 구현 완료 (182줄)

**왜**: 복잡한 작업에서 Claude가 중간에 멈추는 것이 가장 큰 불만.
**어떻게**: Stop 훅에서 `pending-prd.json`의 미완료 스토리를 감지하면 지속 메시지 주입.
**OMC 구현 참고**:
```
1. PRD 설정 (prd.json에 User Story + 수용기준)
2. 최고 우선순위 passes:false 스토리 선택
3. 에이전트 위임으로 구현
4. 수용기준을 fresh evidence로 검증
5. passes:true 마킹 → 다음 스토리
6. 전체 완료 시 Reviewer 검증
7. 필수 Deslop 패스
8. 회귀 재검증
9. 클린 종료
```

### 4.2 `/ship` — 완전 자동 출시 ✅ 구현 완료 (259줄)

**왜**: 테스트→리뷰→버전범프→커밋→PR이 매번 반복되는 수작업.
**어떻게**: gstack의 10단계 파이프라인 참고.
```
Step 0: 플랫폼 감지 (GitHub/GitLab)
Step 1: Pre-flight (브랜치, diff, Review Dashboard)
Step 2: base 머지
Step 3: 테스트 + 커버리지
Step 3.5: Pre-landing 리뷰
Step 4: VERSION 범프 + CHANGELOG
Step 5: 커밋
Step 7: Push
Step 8: PR 생성
```

### 4.3 `/retro` — 주간 회고 ✅ 구현 완료 (199줄)

**왜**: compound가 축적은 하지만, "지난주 어떤 패턴이 유효했는지" 리뷰하는 메커니즘이 없음.
**어떻게**: 커밋 히스토리 + compound evidence + 세션 로그 분석 → 추세/패턴/개선점 보고.

### 4.4 `/learn` — 학습 관리 ✅ 구현 완료 (216줄)

**왜**: compound 솔루션이 쌓이기만 하고 정리/검토/가지치기가 없음.
**어떻게**: search, prune (stale/모순 검출), export, stats, 크로스 프로젝트 공유.

### 4.5 `/ultrawork` — 병렬 실행 기본형 ❌ 연기됨

> **설계 결정 (2026-04-14)**: forge-loop 내부에서 병렬 단계를 처리하는 것으로 대체. 독립 스킬로서의 ultrawork는 연기.

**왜**: 독립 작업을 순차로 처리하면 시간 낭비.
**어떻게**: 작업 독립성 분류 → 독립 작업 동시 Agent 발사 → 의존 작업만 순차.

---

## 5. 에이전트 재설계 안 ✅ 구현 완료

### 현재 19개 → 12개 (구현됨)

**삭제 (7개)**:
- `performance-reviewer` → `code-reviewer`에 통합
- `security-reviewer` → `code-reviewer`에 통합 (리뷰 관점 파라미터화)
- `refactoring-expert` → `executor`에 통합
- `code-simplifier` → `executor`에 통합
- `scientist` → 범용적이라 별도 에이전트 불필요
- `qa-tester` → `verifier`에 통합
- `writer` → Haiku 모델의 문서 에이전트는 효과 미미

**프롬프트 강화 (전체 12개)** ✅:
- 전체 에이전트에 Failure_Modes_To_Avoid, Examples (Good/Bad), Success_Criteria 추가
- maxTurns, color 속성 추가
- 기존 tier/lane 메타데이터 제거

**신규 (0개)**: 현재 12개로 충분. 에이전트 수보다 프롬프트 품질이 중요.

### 최종 구성 (12개)

| Lane | 에이전트 | 모델 | 역할 |
|------|---------|------|------|
| **Build** | explore | Haiku | 코드베이스 탐색 (READ-ONLY) |
| | analyst | Opus | 요구사항 분석, Socratic 질의 (READ-ONLY) |
| | planner | Opus | 전략 계획, 작업 분해 |
| | architect | Opus | 아키텍처 분석/가이드 (READ-ONLY) |
| | executor | Sonnet | 코드 구현/수정 전담 |
| | debugger | Sonnet | 루트 원인 분석, 가설 검증 |
| **Review** | code-reviewer | Opus | 통합 리뷰 (품질+보안+성능 관점 파라미터) |
| | critic | Opus | 최종 품질 게이트, Pre-mortem |
| **Domain** | test-engineer | Sonnet | 테스트 전략/작성 |
| | designer | Sonnet | UI/UX 구현 |
| | git-master | Sonnet | Git 워크플로우 |
| | verifier | Sonnet | 완료 증거 수집, 회귀 검증 |

---

## 6. 기술적 개선 아이디어 (경쟁자에서 배울 것)

| 아이디어 | 출처 | forgen 적용 |
|---------|------|------------|
| **Stop 훅 지속 모드** | OMC ralph | 미완료 PRD 감지 시 중단 방지 메시지 주입 |
| **preamble-tier** | gstack | 스킬별 프리앰블 복잡도 제어 (1=최소, 4=풀) |
| **SKILL.md.tmpl** | gstack | 공통 섹션을 플레이스홀더로 관리하여 DRY |
| **bridge 패턴** | OMC | UserPromptSubmit 6개 훅 → 단일 프로세스 라우팅 |
| **3-layer disclosure** | claude-mem | 인덱스 → 타임라인 → 전체 (10x 토큰 절약) |
| **Failure Modes 섹션** | OMC | 각 에이전트에 흔한 실수 사전 방지 목록 |
| **학습 가지치기** | gstack /learn | stale/모순 솔루션 자동 감지 + 정리 |
| **Eureka 로그** | gstack | 1차 원리가 통설과 충돌할 때 기록 |
| **Stuck loop 감지** | GSD-2 | auto-compound에 무한 루프 탐지 |
| **Review Readiness Dashboard** | gstack /ship | 출시 전 리뷰 상태 시각적 표시 |
| **커밋 프로토콜** | OMC | Constraint/Rejected/Confidence 트레일러 |
| **도구 접근 물리적 차단** | OMC, OpenCode | 읽기전용 에이전트의 Write/Edit 도구 제거 |
