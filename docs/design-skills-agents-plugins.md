# Forgen v0.3 — 스킬 / 에이전트 / 플러그인 세부 설계

> 설계 원칙: "쓸수록 나를 더 잘 아는 Claude"
> 경쟁자가 오케스트레이션(OMC), 브라우저(gstack), 멀티모델(OpenCode)로 싸울 때,
> forgen은 **학습 루프**로 싸운다.
>
> **구현 상태 (2026-04-14)**: 전체 설계가 구현 완료됨. 아래 문서는 설계 제안서에서 구현 기록으로 업데이트됨.
> - 스킬: 21개 → 10개 (16개 삭제, 5개 유지+강화, 5개 신규) ✅
> - 에이전트: 19개 → 12개 (7개 삭제, 전체 프롬프트 강화) ✅
> - 플러그인: `.forgen/skills/` 스캔 경로 추가 ✅
> - 테스트: 1531/1531 통과 ✅

---

## 0. 설계 철학 — Compound-Native

모든 스킬과 에이전트는 3가지 원칙을 따른다:

```
1. Compound-In:  실행 전 관련 compound 솔루션을 자동 로드
2. Profile-Fit:  사용자 4축 프로필에 따라 동작을 조정
3. Compound-Out: 실행 후 학습할 패턴이 있으면 자동 추출 제안
```

경쟁자의 스킬은 "프롬프트를 주입하는 것"이 전부.
forgen의 스킬은 **실행할수록 축적된 지식으로 다음 실행이 더 정확해진다**.

---

## 1. 플러그인 시스템

### 1.1 커스텀 스킬 로딩

```
검색 경로 (우선순위):
1. .forgen/skills/*.md          (프로젝트 스코프)
2. ~/.forgen/skills/*.md        (글로벌 스코프)
3. <forgen>/skills/*.md         (빌트인)
```

프로젝트 스코프가 글로벌을 오버라이드하고, 글로벌이 빌트인을 오버라이드.
같은 이름의 스킬이 여러 경로에 있으면 **가장 좁은 스코프**가 우선.

### 1.2 SKILL.md 포맷

```yaml
---
name: my-skill
description: >
  This skill should be used when the user asks to "트리거1,트리거2".
  한 줄 설명.
version: 1.0.0
# compound 연동
compound:
  search-on-start: true         # 실행 시 관련 솔루션 자동 검색
  extract-on-complete: true     # 완료 시 패턴 추출 제안
  search-query: "키워드"        # 검색 쿼리 (생략 시 name 사용)
# 프로필 적응
profile-adapt:
  quality_safety:               # 축별 동작 조정
    보수형: "모든 단계에서 사용자 확인"
    속도형: "자동 진행, 최종 결과만 보고"
  autonomy:
    확인 우선형: "각 단계 전 승인 요청"
    자율 실행형: "완료 후 일괄 보고"
# 의존 스킬 (선행 실행 권장)
benefits-from: []
# 에이전트 위임
delegates-to: []
---

<Purpose>
이 스킬이 해결하는 문제와 사용 시점.
</Purpose>

<Steps>
## Step 1: ...
## Step 2: ...
</Steps>

<Policy>
- 규칙 1
- 규칙 2
</Policy>

<Failure_Modes>
- 흔한 실패 패턴과 회피 방법
</Failure_Modes>

<Arguments>
## 사용법
`/forgen:my-skill {인자}`
</Arguments>
```

**gstack 대비 차별점**: `compound` 블록과 `profile-adapt` 블록.
스킬이 실행될 때마다 compound 지식이 자동으로 흘러들어오고,
사용자 프로필에 따라 동작이 자동 조정된다.

### 1.3 스킬 자동 등록

harness.ts의 기존 Step 8 (스킬 설치)을 확장:

```typescript
// 현재: skills/ → .claude/commands/forgen/ 복사
// 변경: skills/ + ~/.forgen/skills/ + .forgen/skills/ 모두 스캔 → 머지 → 복사
async function installSkills(ctx: HarnessContext): Promise<void> {
  const sources = [
    { path: resolve(ctx.cwd, '.forgen/skills'), scope: 'project' },
    { path: resolve(FORGEN_HOME, 'skills'),     scope: 'global' },
    { path: resolve(PACKAGE_ROOT, 'skills'),    scope: 'builtin' },
  ];

  const skills = new Map<string, SkillEntry>();

  // 역순으로 로드하여 좁은 스코프가 오버라이드
  for (const source of sources.reverse()) {
    for (const skillDir of await readSkillDirs(source.path)) {
      skills.set(skillDir.name, { ...skillDir, scope: source.scope });
    }
  }

  // .claude/commands/forgen/ 에 설치
  for (const [name, skill] of skills) {
    await copySkill(skill, COMMANDS_DIR);
  }
}
```

### 1.4 커스텀 에이전트 로딩

```
검색 경로 (우선순위):
1. .forgen/agents/*.md          (프로젝트 스코프)
2. ~/.forgen/agents/*.md        (글로벌 스코프)
3. <forgen>/agents/*.md         (빌트인)
```

같은 패턴. 사용자가 `~/.forgen/agents/my-reviewer.md`를 만들면
자동으로 Claude Code 에이전트로 등록된다.

### 1.5 스킬 자동 추출 (learner)

OMC/gstack의 learner 패턴을 compound-native로 재해석:

```
세션 종료 시 (auto-compound-runner.ts에서):
1. 세션 트랜스크립트 분석
2. 하드원 디버깅 해결, 비명시적 워크어라운드, 숨겨진 gotcha 감지
3. 품질 게이트:
   - "5분 안에 구글링 가능?" → 제외
   - "이 코드베이스 특정?" → scope: project
   - "범용?" → scope: me 또는 universal
4. SKILL.md 형식으로 .forgen/skills/ 에 저장 (사용자 확인 후)
5. compound solution으로도 이중 등록
```

기존 `compound --solution`과 다른 점:
- compound는 **검색용 지식** (solution-injector가 프롬프트에 주입)
- skill은 **행동 지침** (slash command로 명시적 호출)
- 같은 지식이지만 **접근 경로가 다르다**

---

## 2. 스킬 재설계 — 21개 → 10개 ✅ 구현 완료

> **설계 대비 변경점**:
> - 원안은 21개 → 12개 (9개 삭제 + 6개 신규)였으나, 최종 구현은 21개 → 10개
> - `ultrawork` 연기 (forge-loop 내부 병렬화로 대체)
> - `ci-cd` 삭제 (compound 연동이 약하고 셀링 포인트와 무관)
> - `docker` 유지 (compound integration이 정당화)
> - `code-review`가 `security-review`와 `performance` 관점을 흡수 (리뷰 관점 파라미터)

### 2.1 삭제 (16개)

| 삭제 스킬 | 이유 |
|----------|------|
| `refactor` | executor 에이전트 역할과 100% 중복 |
| `tdd` | Red-Green-Refactor 교과서. Claude가 이미 앎 |
| `testing-strategy` | 테스트 피라미드 일반론. test-engineer 에이전트로 충분 |
| `documentation` | Divio 4유형 재설명. writer 역할 |
| `git-master` | git-master 에이전트와 이름까지 중복 |
| `ecomode` | "Haiku로 바꿔줘" 한 줄이면 됨 |
| `specify` | deep-interview와 목적 동일 |
| `performance` | code-reviewer에서 관점 파라미터(`--performance`)로 처리 |
| `incident-response` | 장애 대응은 상황별 차이가 커서 범용 체크리스트 무의미 |
| `database` | 체크리스트 수준. compound 연동 약함 |
| `frontend` | 체크리스트 수준. compound 연동 약함 |
| `ci-cd` | compound 연동이 약하고 셀링 포인트와 무관 |
| `api-design` | 체크리스트 수준 |
| `debug-detective` | debugger 에이전트와 중복 |
| `migrate` | 범용 체크리스트 |
| `security-review` | code-reviewer에서 관점 파라미터(`--security`)로 처리 |

### 2.2 유지 + 강화 (5개) ✅ 구현 완료

#### `/compound` (유지, 강화) — 159줄, 5-Question Filter, Health Dashboard, 4 structured categories

기존 4-Phase 구조에 추가:

```diff
+ ## Phase 0: Compound-In (자동)
+ compound-search로 이전 세션에서 추출한 패턴 로드.
+ "이전에 이런 패턴을 추출한 적 있음:" 표시.
+ 중복 추출 방지.

  ## Phase 1: 세션 분석 (기존 유지)
  ## Phase 2: 품질 게이트 (기존 유지)
  ## Phase 3: 축적 (기존 유지)
  ## Phase 4: 리포트 (기존 유지)

+ ## Phase 5: 학습 건강도 보고
+ ```
+ COMPOUND HEALTH / 복리 건강도
+ ═══════════════════════════════
+ 총 솔루션: 47개
+ ├─ mature (3+회 사용): 12개 ████████████
+ ├─ verified (2회):      8개 ████████
+ ├─ candidate (1회):    15개 ███████████████
+ └─ experiment (미사용): 12개 ████████████  ← 정리 후보
+
+ 최근 7일 활용률: 23% (47개 중 11개 주입됨)
+ 추천: experiment 12개 중 30일+ 미사용 5개 retire 제안
+ ```
```

#### `/deep-interview` (유지, 강화) — 266줄, 가중치 4-dimension scoring, 3 challenge modes, ontology tracking, anti-sycophancy

기존 Ambiguity Score 체계에 OMC에서 배운 기능 추가:

```diff
  ## Ambiguity Score 체계 (기존 유지)

+ ## 도전 모드 (라운드별 관점 전환)
+
+ | 라운드 | 모드 | 행동 |
+ |--------|------|------|
+ | 1-3 | Explorer | 핵심 정보 수집 |
+ | 4-5 | Contrarian | 핵심 가정에 도전. "반대가 진실이라면?" |
+ | 6-7 | Simplifier | 복잡성 제거. "이거 빼도 되지 않나?" |
+ | 8+ | Ontologist | "이게 진짜 무엇인가?" |

+ ## 실행 브릿지
+ 인터뷰 완료 후 자동 라우팅:
+ - ambiguity <= 3.0 → "구현 준비 완료. /forge-loop 시작?"
+ - ambiguity 3.1-5.0 → "가정 목록 확인 후 진행"
+ - ambiguity > 5.0 → "추가 인터뷰 필요"

+ ## Compound-In
+ 이전 deep-interview 세션의 결과를 자동 로드.
+ "지난번 {프로젝트}에서 이런 주제를 다뤘음:" 표시.
```

#### `/architecture-decision` (유지, 강화) — 165줄, 가중치 trade-off matrix, ADR lifecycle, compound ADR history

```diff
  ## ADR 프로세스 (기존 유지)

+ ## Compound-In
+ compound-search "architecture decision {기술 키워드}"로
+ 이전 ADR을 자동 로드. "이전에 유사한 결정:"
+
+ ## Compound-Out
+ ADR 작성 완료 시 자동으로 compound solution 제안:
+ - 제목: "ADR: {결정 제목}"
+ - 내용: 컨텍스트 + 결정 + 근거 요약
```

#### `/code-review` (유지, 관점 통합) — 218줄, confidence 1-10, Critical Category 5, auto-fix, compound history

security-review, performance를 흡수하여 **관점 파라미터** 추가:

```yaml
---
name: code-review
description: >
  This skill should be used when the user asks to
  "code review,코드 리뷰,리뷰해줘,review this,
  보안 리뷰,security review,성능 리뷰".
compound:
  search-on-start: true
  search-query: "code review {파일경로}"
  extract-on-complete: true
---

<Steps>
## Step 1: 관점 결정

인자 또는 맥락에서 관점을 결정:
- `--security` 또는 "보안" 언급 → 보안 중심 (OWASP Top 10, CWE)
- `--performance` 또는 "성능" 언급 → 성능 중심 (O(n), 메모리, 캐싱)
- 기본 → 종합 (정확성 → 보안 → 성능 → 유지보수성 순서)

## Step 2: Compound-In
compound-search로 이 파일/모듈 관련 이전 리뷰 패턴 로드.
"이전에 이 모듈에서 발견된 이슈:" 표시.

## Step 3: 리뷰 실행
(기존 20항목 체크리스트 유지)

## Step 4: 리포트
(기존 APPROVE/REJECT 형식 유지)

## Step 5: Compound-Out
CRITICAL/MAJOR 발견 시 compound solution 제안:
- "{모듈명}-{이슈유형}" 패턴으로 축적
- 다음 리뷰에서 자동 로드됨
</Steps>
```

#### `/docker` (유지) — 146줄, compound integration, 10 failure modes

> **설계 결정**: 원안에서는 삭제 후보였으나, compound integration이 정당화하여 유지.

#### ~~`/ci-cd`~~ ❌ 삭제됨

> **설계 결정**: compound 연동이 약하고 셀링 포인트와 무관하여 최종 삭제. 원안에서는 유지 예정이었음.

### 2.3 신규 스킬 (5개) ✅ 구현 완료

> **설계 대비 변경점**: 원안 6개 중 `ultrawork`가 연기되어 5개 구현.

#### `/forge-loop` — 완료까지 루프 (forgen의 ralph) — 182줄 구현

```yaml
---
name: forge-loop
description: >
  This skill should be used when the user asks to
  "forge-loop,포지루프,끝까지,don't stop,완료까지,ralph".
  Complete until verified — the forgen way.
compound:
  search-on-start: true
  search-query: "forge-loop troubleshoot"
  extract-on-complete: true
profile-adapt:
  quality_safety:
    보수형: "매 스토리 완료 후 사용자 확인"
    균형형: "CRITICAL 이슈만 확인, 나머지 자동"
    속도형: "전체 완료 후 일괄 보고"
delegates-to: [planner, executor, verifier, critic]
---

<Purpose>
주어진 작업을 모든 수용 기준이 충족될 때까지 자동으로 반복 실행합니다.
OMC ralph와 달리, 각 반복에서 compound 패턴을 추출하여
다음 반복의 정확도를 높입니다.
</Purpose>

<Steps>
## Step 0: PRD 설정

사용자 요청을 User Story로 분해합니다:

```json
// .forgen/state/forge-loop.json
{
  "stories": [
    {
      "id": "S1",
      "title": "사용자 인증 구현",
      "acceptance": [
        "JWT 토큰 발급/검증 동작",
        "만료된 토큰 거부",
        "리프레시 토큰으로 재발급"
      ],
      "passes": false,
      "attempts": 0
    }
  ],
  "config": {
    "max_attempts_per_story": 3,
    "verification": "auto"   // profile quality_safety에 따라 조정
  }
}
```

## Step 1: Compound-In

compound-search로 관련 패턴 로드:
- 이전 forge-loop 실패 패턴
- 이 프로젝트의 기존 솔루션
- "이전에 유사한 작업에서 이런 문제가 있었음:" 표시

## Step 2: 스토리 실행 루프

```
for each story where passes == false:
  1. 가장 높은 우선순위 스토리 선택
  2. executor 에이전트에 위임 (구현)
  3. verifier 에이전트에 위임 (각 수용기준 검증)
  4. 모든 수용기준 통과 → passes: true, 다음 스토리
  5. 실패 시:
     - attempts++
     - 실패 원인 compound solution으로 기록
     - attempts >= max → 사용자에게 에스컬레이션
     - 아니면 수정 후 재시도
```

## Step 3: 최종 검증

모든 스토리 passes: true일 때:
1. critic 에이전트로 전체 변경사항 리뷰
2. 빌드 + 테스트 전체 실행
3. CRITICAL 이슈 → 해당 스토리로 루프백
4. 통과 → 완료 보고

## Step 4: Compound-Out

```
FORGE-LOOP 완료
═══════════════
스토리: 5/5 완료
반복: 총 8회 (평균 1.6회/스토리)
추출된 패턴: 3개
├─ "JWT-refresh-token-race-condition" (troubleshoot)
├─ "prisma-migration-order-dependency" (pattern)
└─ "vitest-mock-cleanup-afterEach" (anti-pattern)

compound에 저장하시겠습니까? [Y/n]
```
</Steps>

<Stop_Hook_Integration>
forge-loop 활성 시 Stop 이벤트에서:
1. .forgen/state/forge-loop.json 확인
2. 미완료 스토리가 있으면:
   - additionalContext에 "미완료 스토리 N개. 계속 진행하세요." 주입
   - continue: true 반환
3. 모든 스토리 완료 시:
   - forge-loop.json 정리
   - compound 추출 제안
</Stop_Hook_Integration>

<Failure_Modes>
- 무한 루프: max_attempts_per_story로 바운드. 3회 실패 시 에스컬레이션
- context rot: 5+ 스토리 시 중간에 compact 유도
- scope creep: PRD에 없는 작업을 시작하면 경고
</Failure_Modes>
```

#### `/ship` — 자동 출시 — 259줄 구현 (15-step pipeline, "never ask just do", Review Readiness Dashboard)

```yaml
---
name: ship
description: >
  This skill should be used when the user asks to
  "ship,출시,릴리스,release,배포".
  One-command release pipeline.
compound:
  search-on-start: true
  search-query: "ship release deploy"
  extract-on-complete: true
profile-adapt:
  quality_safety:
    보수형: "모든 게이트에서 확인"
    속도형: "테스트 통과 시 자동 진행"
delegates-to: [verifier, code-reviewer, git-master]
---

<Purpose>
테스트 → 리뷰 → 버전 범프 → 커밋 → PR 생성을 원커맨드로 실행합니다.
</Purpose>

<Steps>
## Step 0: Pre-flight

```bash
# 자동 실행
git status                    # 미커밋 변경 확인
git log --oneline main..HEAD  # 커밋 히스토리
```

- 현재 브랜치가 main이면 → 새 브랜치 생성 제안
- 미커밋 변경이 있으면 → 커밋 먼저 제안

## Step 1: Compound-In

compound-search "ship release {프로젝트명}"
- 이전 출시에서 발생한 이슈 로드
- "지난 출시에서 이런 문제가 있었음:" 표시

## Step 2: 테스트 실행

```bash
# 프레임워크 자동 감지
npm test || bun test || yarn test || pnpm test
```

- 실패 시: 에러 분석 → 수정 제안 → 사용자 확인 → 재실행
- 통과 시: 다음 단계

## Step 3: Pre-landing 리뷰

code-reviewer 에이전트 위임:
- main 대비 diff 전체 리뷰
- CRITICAL 발견 시 → 중단, 수정 후 재실행
- MAJOR 이하 → 경고만 표시

## Step 4: 버전 범프 + CHANGELOG

```bash
# package.json version 읽기
# 변경 내용 분석 → semver 결정
# - breaking change → major
# - new feature → minor
# - bug fix → patch
```

CHANGELOG.md 자동 생성 (커밋 메시지 기반).

## Step 5: 커밋 + Push + PR

```bash
git add -A
git commit -m "release: v{version}"
git push -u origin HEAD
gh pr create --title "Release v{version}" --body "..."
```

## Step 6: Compound-Out

출시 과정에서 발생한 이슈를 compound에 기록 제안.

## 리포트

```
SHIP COMPLETE
═════════════
Version: 0.3.0 → 0.3.1 (patch)
Tests: 142 passed, 0 failed
Review: APPROVED (0 critical, 2 minor)
PR: #47 created
URL: https://github.com/...
```
</Steps>

<Failure_Modes>
- 테스트 실패: 자동 수정 시도 1회 → 실패 시 사용자에게 보고
- 머지 충돌: 자동 해결 시도 안 함 → 사용자에게 보고
- CI 실패: PR 생성 후 CI 결과 폴링 → 실패 시 알림
</Failure_Modes>
```

#### `/retro` — 주간 회고 + compound 분석 — 199줄 구현 (세션 패턴, compound health 3-tier, compare mode)

```yaml
---
name: retro
description: >
  This skill should be used when the user asks to
  "retro,회고,retrospective,이번주,돌아보기".
  Weekly retrospective with compound analysis.
compound:
  search-on-start: false   # 전체 compound를 분석하므로 별도 검색 불필요
  extract-on-complete: false
---

<Purpose>
최근 작업을 분석하여 패턴, 성장, 개선점을 발견합니다.
git 히스토리 + compound evidence + 세션 품질 점수를 교차 분석합니다.
</Purpose>

<Steps>
## Step 1: 데이터 수집

```bash
# 최근 7일 커밋
git log --since="7 days ago" --oneline --stat

# compound 통계
forgen compound stats

# 세션 품질 (있으면)
ls ~/.forgen/state/session-quality/
```

## Step 2: 분석

### 코드 활동
- 총 커밋 수, 변경 줄 수, 파일 수
- 가장 많이 변경된 파일 Top 5 (핫스팟)
- 커밋 패턴 (시간대, 크기 분포)

### Compound 건강도
- 새로 추출된 솔루션 수
- 실제 주입/사용된 솔루션 수
- 활용률 (사용된 / 전체)
- stale 솔루션 후보 (30일+ 미사용)
- 모순되는 솔루션 쌍 감지

### 세션 품질 추세
- 교정 횟수 추세 (줄고 있으면 학습 중)
- 드리프트 이벤트 추세
- 평균 세션 길이 변화

## Step 3: 보고서

```
WEEKLY RETRO / 주간 회고
════════════════════════
기간: 2026-04-07 ~ 2026-04-14

CODE ACTIVITY
─────────────
커밋: 23개 | 변경: +1,847 / -523 | 파일: 34개
핫스팟: src/engine/compound-lifecycle.ts (7회 수정)
패턴: 오후 2-6시에 집중 작업

COMPOUND HEALTH
───────────────
총 솔루션: 47개 (신규 +5, retire -2)
활용률: 28% (47개 중 13개 이번 주 주입됨)
Top 활용: "vitest-mock-pattern" (4회), "prisma-upsert" (3회)
Stale 후보: 8개 (retire 검토 필요)
모순 감지: 0개

LEARNING TREND
──────────────
교정 횟수: 12 → 8 → 5 (↓ 감소 추세 — 학습 중)
드리프트: 0회 (안정적)
세션 평균 길이: 45분 → 38분 (↓ 효율 개선)

RECOMMENDATIONS
───────────────
1. src/engine/compound-lifecycle.ts 7회 수정 → 구조 리뷰 권장
2. stale 솔루션 8개 retire 검토
3. 교정 감소 추세 유지 — 현재 프로필 설정 적절
```
</Steps>
```

#### `/learn` — compound 학습 관리 — 216줄 구현 (5 서브커맨드, prune/export/import, stats 시각화)

```yaml
---
name: learn
description: >
  This skill should be used when the user asks to
  "learn,학습 관리,compound 정리,솔루션 정리,prune".
  Manage accumulated compound knowledge.
---

<Purpose>
축적된 compound 솔루션을 검색, 정리, 가지치기, 내보내기합니다.
</Purpose>

<Steps>
## 서브커맨드

### `/learn search {쿼리}`
compound-search MCP로 관련 솔루션 검색.
결과를 요약하여 표시.

### `/learn prune`
정리 후보를 자동 감지:
- **Stale**: 30일+ 미사용 솔루션
- **Duplicate**: 유사도 80%+ 솔루션 쌍
- **Contradictory**: 모순되는 솔루션 쌍
- **Low-quality**: experiment 상태에서 60일+ 승격 안 된 솔루션

각 후보에 대해 retire/merge/keep 선택.

### `/learn stats`
```
COMPOUND STATS
══════════════
총: 47개 솔루션
├─ mature:     12개 (25.5%) — 3+회 사용, 검증됨
├─ verified:    8개 (17.0%) — 2회 사용
├─ candidate:  15개 (31.9%) — 1회 사용
├─ experiment: 12개 (25.5%) — 미사용
├─ 유형: pattern 20, troubleshoot 15, decision 8, anti-pattern 4
├─ 스코프: me 30, project 12, universal 5
└─ 최근 7일 활용률: 28%
```

### `/learn export`
compound 전체를 tar.gz로 내보내기.
다른 프로젝트나 팀원에게 공유 가능.

### `/learn import {경로}`
내보낸 compound를 가져오기.
중복 검사 후 머지.
</Steps>
```

#### `/calibrate` — 프로필 재보정 — 207줄 구현 (정량적 프로토콜, evidence 교차 검증, direction scoring)

```yaml
---
name: calibrate
description: >
  This skill should be used when the user asks to
  "calibrate,보정,프로필 조정,캘리브레이트".
  Recalibrate personalization profile based on evidence.
---

<Purpose>
축적된 evidence(교정 기록)를 분석하여 4축 프로필 조정을 제안합니다.
"Claude가 당신을 얼마나 잘 이해하고 있는지" 확인하는 도구입니다.
</Purpose>

<Steps>
## Step 1: Evidence 수집

```bash
# evidence 파일 로드
ls ~/.forgen/me/evidence/
```

## Step 2: 축별 분석

### quality_safety 축
- "하지마", "확인해" 류 교정 → 보수형으로 이동 제안
- "그냥 해", "빨리" 류 교정 → 속도형으로 이동 제안
- 교정 없음 → 현재 설정 유지

### autonomy 축
- "왜 물어봐", "알아서 해" → 자율 실행형으로 이동
- "먼저 물어봐", "확인받고" → 확인 우선형으로 이동

### judgment_philosophy 축
- "너무 많이 바꿨어" → 최소변경형으로 이동
- "근본적으로 바꿔" → 구조적접근형으로 이동

### communication_style 축
- "너무 길어" → 간결형으로 이동
- "더 자세히" → 상세형으로 이동

## Step 3: 보고서

```
PROFILE CALIBRATION / 프로필 보정
═════════════════════════════════
기간: 최근 30일 | 세션: 15개 | 교정: 23개

현재 프로필:
  quality_safety:      균형형
  autonomy:            자율 실행형
  judgment_philosophy: 최소변경형
  communication_style: 간결형

교정 분석:
  quality_safety:      교정 3건 → "확인 더 해줘" 방향
                       → 보수형으로 변경 제안? [Y/n]
  autonomy:            교정 0건 → 현재 설정 적절
  judgment_philosophy: 교정 1건 → 현재 설정 유지
  communication_style: 교정 2건 → "코드 보여줘" 방향
                       → 현재 설정 유지 (코드는 간결형에서도 보여줌)

적용하시겠습니까? [Y/n/커스텀]
```
</Steps>
```

#### `/ultrawork` — 병렬 실행 기본형 ❌ 연기됨

> **설계 결정 (2026-04-14)**: forge-loop 내부에서 병렬 단계를 처리하는 것으로 대체. 독립 스킬로서의 ultrawork는 연기.

```yaml
---
name: ultrawork
description: >
  This skill should be used when the user asks to
  "ultrawork,ulw,병렬,parallel,동시에".
  Maximum parallelism for independent tasks.
compound:
  search-on-start: true
  extract-on-complete: true
profile-adapt:
  quality_safety:
    보수형: "각 병렬 작업 완료 후 리뷰"
    속도형: "전체 완료 후 일괄 리뷰"
delegates-to: [executor, explore]
---

<Purpose>
독립적인 작업들을 동시에 실행하여 시간을 절약합니다.
Claude Code의 Agent 도구를 활용하여 병렬 에이전트를 발사합니다.
</Purpose>

<Steps>
## Step 1: 작업 분해

사용자 요청을 개별 작업으로 분해합니다.

## Step 2: 의존성 분석

각 작업 간 의존성을 파악:
- 독립 작업: 동시 실행 가능
- 의존 작업: 선행 작업 완료 후 순차 실행

```
작업 그래프:
  [A: 유저 모델] ──→ [C: API 엔드포인트]
  [B: DB 스키마] ──→ [C: API 엔드포인트]
  [D: 테스트 설정]  (독립)

실행 계획:
  Wave 1: A, B, D (동시 발사)
  Wave 2: C (A, B 완료 후)
```

## Step 3: 병렬 발사

독립 작업을 동시에 Agent 도구로 위임:

```
각 에이전트에게:
- 작업 설명
- 관련 compound 솔루션 (자동 검색 결과)
- 모델 티어 (작업 복잡도에 따라 haiku/sonnet/opus)
- run_in_background: true (30초+ 예상 작업)
```

## Step 4: 수집 + 검증

모든 에이전트 완료 후:
- 결과 수집
- 충돌 감지 (같은 파일 수정 시)
- 빌드 + 테스트

## Step 5: Compound-Out

병렬화 패턴을 compound에 기록 제안:
- "이 프로젝트에서 {A}와 {B}는 독립적으로 실행 가능"
</Steps>

<Failure_Modes>
- 충돌: 두 에이전트가 같은 파일을 수정 → 수동 머지 요청
- 의존성 오판: Wave 순서 잘못 → 에러 후 재실행
- 과도한 병렬: 최대 4개 동시 에이전트로 제한
</Failure_Modes>
```

### 2.4 최종 스킬 목록 (10개) ✅ 구현 완료

> 원안 12개에서 `ultrawork` 연기, `ci-cd` 삭제로 최종 10개.

| # | 스킬 | 유형 | 줄 수 | Compound 연동 | 주요 기능 |
|:-:|------|------|:----:|:----------:|----------|
| 1 | `/deep-interview` | 핵심 | 266 | In | 가중치 4-dimension scoring, 3 challenge modes, ontology, anti-sycophancy |
| 2 | `/ship` | 신규 | 259 | In + Out | 15-step pipeline, "never ask just do", Review Readiness Dashboard |
| 3 | `/code-review` | 통합 | 218 | In + Out | confidence 1-10, Critical Category 5, auto-fix, compound history |
| 4 | `/learn` | 신규 | 216 | 전체 관리 | 5 서브커맨드, prune/export/import, stats 시각화 |
| 5 | `/calibrate` | 신규 | 207 | Evidence 분석 | 정량적 프로토콜, evidence 교차 검증, direction scoring |
| 6 | `/retro` | 신규 | 199 | 전체 분석 | 세션 패턴, compound health 3-tier, compare mode |
| 7 | `/forge-loop` | 신규 | 182 | In + Out + Stop 훅 | PRD 구조, Anti-Polite-Stop, Verifier 강제, circuit breakers |
| 8 | `/architecture-decision` | 핵심 | 165 | In + Out | 가중치 trade-off matrix, ADR lifecycle, compound ADR history |
| 9 | `/compound` | 핵심 | 159 | 자체 | 5-Question Filter, Health Dashboard, 4 structured categories |
| 10 | `/docker` | 유지 | 146 | In | compound integration, 10 failure modes |
| - | ~~`/ultrawork`~~ | ~~신규~~ | - | - | ❌ 연기 — forge-loop 내부 병렬화로 대체 |
| - | ~~`/ci-cd`~~ | ~~유지~~ | - | - | ❌ 삭제 — compound 연동 약함 |

---

## 3. 에이전트 재설계 — 19개 → 12개 ✅ 구현 완료

### 3.1 설계 원칙 (구현됨)

1. **도구 접근 물리적 분리**: READ-ONLY 에이전트는 Write/Edit 도구 차단
2. **Failure Modes 명시**: 각 에이전트에 `Failure_Modes_To_Avoid` 섹션 구현
3. **Compound 연동**: executor/verifier에 compound 검색/기록 통합
4. **프롬프트 품질 강화**: 전체 에이전트에 Examples (Good/Bad), Success_Criteria 추가

**구현 시 추가된 속성** (원안에 없던 것):
- `maxTurns`: 에이전트별 최대 턴 수 제한
- `color`: 에이전트 구분용 컬러 코드
- `tier`/`lane` 메타데이터 **제거** (원안에서는 사용했으나 실제 구현에서 불필요로 판단)

### 3.2 최종 구성 (구현됨)

> **구현 시 변경점**: tier/lane 구분은 제거됨. 대신 각 에이전트에 Failure_Modes_To_Avoid, Examples (Good/Bad), Success_Criteria, maxTurns, color 속성이 추가됨.

```
12개 에이전트 (모두 Failure_Modes_To_Avoid + Examples + Success_Criteria 포함)
├── explore       [Haiku]  코드베이스 탐색     READ-ONLY
├── analyst       [Opus]   요구사항 분석        READ-ONLY
├── planner       [Opus]   전략 계획 수립       PLAN-ONLY
├── architect     [Opus]   아키텍처 설계        READ-ONLY
├── executor      [Sonnet] 코드 구현 전담       FULL ACCESS + compound
├── debugger      [Sonnet] 루트 원인 분석       READ + Bash
├── code-reviewer [Opus]   통합 리뷰 (품질+보안+성능) READ-ONLY
├── critic        [Opus]   최종 품질 게이트     READ-ONLY
├── test-engineer [Sonnet] 테스트 전략/작성     FULL ACCESS
├── designer      [Sonnet] UI/UX 구현          FULL ACCESS
├── git-master    [Sonnet] Git 워크플로우       READ + Bash(git만)
└── verifier      [Sonnet] 완료 증거 수집       READ + Bash + compound
```

### 3.3 강화 에이전트 프롬프트 ✅ 구현 완료

> 아래는 설계 당시의 예시 프롬프트. 실제 구현된 프롬프트는 `agents/` 디렉토리에서 확인.

#### `planner` (25줄 → 90줄+)

```markdown
<!-- forgen-managed -->
---
name: planner
description: Strategic planning with structured decomposition
model: opus
tier: HIGH
lane: build
disallowedTools:
  - Write
  - Edit
allowedPaths:
  - ".forgen/plans/*.md"
---

<Agent_Prompt>

# Planner — 전략 계획 수립

## 역할
- 요구사항을 실행 가능한 계획으로 변환
- 작업을 원자적 단계로 분해
- 리스크와 의존성을 사전에 식별

## 인터뷰 프로토콜
1. **한 번에 한 질문만** (절대 여러 질문 묶지 않음)
2. **코드로 확인 가능한 것은 묻지 않음** → explore 에이전트로 위임
3. **답변에서 숨겨진 요구사항 탐지** → 추가 질문
4. **3라운드 이내에 충분한 정보 수집** → 계획 초안 작성

## 작업 분류
| 유형 | 기준 | 계획 깊이 |
|------|------|---------|
| Trivial | 1파일, 명확한 변경 | 1줄 설명이면 충분 |
| Simple | 2-3파일, 패턴 명확 | 파일별 변경 목록 |
| Scoped | 4-8파일, 인터페이스 변경 | 단계별 계획 + 의존성 |
| Complex | 8+파일, 아키텍처 영향 | 상세 계획 + architect 리뷰 필수 |

## 계획 출력 형식
```
## 계획: {제목}

### 분류: {Trivial|Simple|Scoped|Complex}

### 변경 파일
1. `src/foo.ts` — {변경 내용} (예상 영향: 낮음)
2. `src/bar.ts` — {변경 내용} (예상 영향: 중간)

### 실행 순서
1. {단계} → 검증: {방법}
2. {단계} → 검증: {방법}

### 의존성
- Step 2는 Step 1 완료 후

### 리스크
- {리스크} — 확률: {H/M/L}, 영향: {H/M/L}, 완화: {방법}

### 병렬화 기회
- Step 1과 Step 3은 독립적 → ultrawork 가능
```

## Compound 연동
- 계획 수립 전 compound-search로 유사 작업 패턴 확인
- "이전에 유사한 작업:" 표시하여 계획에 반영

## Failure Modes
- ❌ 탐색 없이 계획 시작 → 반드시 explore 먼저
- ❌ 모든 단계를 한 번에 나열 → 의존성 그래프로 정리
- ❌ "아마 될 거예요" → 각 단계에 구체적 검증 방법 명시
- ❌ 사용자에게 여러 질문 동시에 → 한 번에 하나만
- ❌ 범위 밖 작업 포함 → scope creep 경고

</Agent_Prompt>
```

#### `executor` (35줄 → 85줄+)

```markdown
<!-- forgen-managed -->
---
name: executor
description: Focused code implementation — compound-aware
model: sonnet
tier: MEDIUM
lane: build
tools:
  - Read
  - Edit
  - Write
  - Bash
  - Glob
  - Grep
memory: project
mcpServers:
  - forgen-compound
---

<Agent_Prompt>

# Executor — Compound-Aware 코드 구현

## 역할
- 계획에 따른 정확한 코드 구현
- 최소 변경으로 최대 효과
- 실패 시 compound에 학습 기록

## 실행 프로토콜

### Phase 0: Compound-In (자동)
```
compound-search "{작업 키워드}"
→ 관련 솔루션이 있으면 적용
→ 관련 안티패턴이 있으면 회피
```

### Phase 1: 조사
1. **분류**: Trivial(1파일) / Scoped(2-5파일) / Complex(5+파일)
2. **탐색**: Glob → Grep → Read 순서로 최소 정보 수집
3. **패턴 확인**: 기존 코드의 스타일/패턴 파악

### Phase 2: 구현
1. 수정할 파일과 변경 내용을 먼저 목록화 (코드 작성 전)
2. 파일별 순서대로 구현
3. 각 파일 수정 후 빌드 확인

### Phase 3: 검증
1. 빌드 성공 확인
2. 관련 테스트 실행
3. 타입 체크 (TypeScript 프로젝트인 경우)

### Phase 4: Compound-Out (조건부)
실패 후 해결한 경우:
```
"이 문제의 해결법을 compound에 기록할까요?"
→ troubleshoot 솔루션으로 저장
```

## 편집 검증 프로토콜
- 같은 파일 3회 수정 → **멈추고 Read로 전체 상태 확인**
- 같은 파일 5회 수정 → **중단. 전체 재설계 필요**
- Edit 실패 → old_string이 파일에 존재하는지 확인 후 재시도

## 제약
- 아키텍처 결정 금지 (architect에게 위임)
- 요청 범위 밖 수정 금지 (scope creep)
- 테스트 수정으로 통과시키기 금지 (test hack)
- 불필요한 추상화 생성 금지

## Failure Modes
- ❌ Read 없이 Edit 시도 → 반드시 파일을 먼저 읽음
- ❌ 에러 무시하고 다음 단계 → 에러 해결 후 진행
- ❌ "should work" 추측 → 실행하여 확인
- ❌ 전체 파일 Write로 교체 → 가능하면 Edit으로 최소 변경
- ❌ 3회 연속 같은 에러 → debugger에게 에스컬레이션

## 에스컬레이션
- 아키텍처 문제 → architect
- 3회 연속 실패 → debugger
- 테스트 전략 필요 → test-engineer

</Agent_Prompt>
```

### 3.4 삭제 에이전트와 흡수 경로 ✅ 구현 완료

| 삭제 | 흡수처 | 방법 |
|------|--------|------|
| `performance-reviewer` | `code-reviewer` | 리뷰 관점 파라미터 (`--performance`) |
| `security-reviewer` | `code-reviewer` | 리뷰 관점 파라미터 (`--security`) |
| `refactoring-expert` | `executor` | executor의 Phase 2에서 리팩토링 패턴 적용 |
| `code-simplifier` | `executor` | executor의 제약에 "불필요한 복잡성 제거" 추가 |
| `scientist` | 삭제 | 범용적이라 별도 에이전트 불필요 |
| `qa-tester` | `verifier` | verifier에 수동 테스트 시나리오 생성 추가 |
| `writer` | 삭제 | Haiku 문서 에이전트는 효과 미미. 사용자가 직접 요청 |

---

## 4. 전체 아키텍처 요약

```
사용자
  │
  ├── /forge-loop "기능 구현해줘"
  │     ├── Compound-In: 관련 솔루션 자동 로드
  │     ├── planner: 작업 분해 (90줄 프롬프트)
  │     ├── executor: 구현 (85줄 + compound 검색)
  │     ├── verifier: 검증
  │     ├── critic: 최종 게이트
  │     ├── Stop 훅: 미완료 시 지속
  │     └── Compound-Out: 패턴 추출 제안
  │
  ├── /retro "이번 주 돌아보자"
  │     ├── git log + compound stats + session quality
  │     └── 건강도 보고 + 정리 제안
  │
  ├── /calibrate "프로필 맞나 확인"
  │     ├── evidence 분석
  │     └── 4축 조정 제안
  │
  └── 커스텀: .forgen/skills/my-skill.md
        └── 자동 등록 + compound 연동
```

**핵심 차별점**: 모든 것이 compound를 중심으로 돈다.
경쟁자는 "실행"에 집중하고, forgen은 "실행 + 학습"에 집중한다.
같은 작업을 두 번째 할 때, forgen이 더 정확하다.
