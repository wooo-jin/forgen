---
name: compound
description: This skill should be used when the user asks to "복리화,compound,패턴 추출,솔루션 축적,what did we learn". Compound Engineering — extract reusable patterns from this session's work
argument-hint: "[solution description]"
model: inherit
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__forgen-compound__compound-search
  - mcp__forgen-compound__compound-read
  - mcp__forgen-compound__compound-list
  - mcp__forgen-compound__compound-stats
triggers:
  - "복리화"
  - "compound"
  - "패턴 추출"
  - "솔루션 축적"
  - "what did we learn"
  - "배운 것 정리"
---

<Purpose>
이 세션에서 수행한 작업을 분석하여 재사용 가능한 지식을 추출하고 축적합니다.
당신은 이 대화의 전체 맥락을 갖고 있으므로, git diff만으로는 알 수 없는 "왜"를 포함할 수 있습니다.
참고: CLI `forgen compound`는 최근 코드/세션을 자동 분석한 결과를 미리보기하고, `--save`일 때만 저장합니다. 이 slash skill은 대화 전체 맥락을 바탕으로 수동 추출할 때 사용합니다.
</Purpose>

<Compound_Integration>
## Phase 0: Compound-In (중복 방지 검색)

추출 전 기존 compound 패턴을 검색하여 중복을 방지합니다.

```
compound-search("[핵심 키워드]")
compound-stats
```

결과 기반:
- 동일 패턴 존재 → 업데이트 vs 신규 판단
- 유사하지만 다른 맥락 → 별도 항목 + 기존 항목 관계 명시
- 완전히 새로운 → 신규 저장
</Compound_Integration>

<Steps>
## Phase 1: 세션 분석 (4개 구조화 카테고리)

### pattern (HOW to do something)
- 재사용 가능한 접근법, 효과적이었던 기법
- 제목: `"{topic}-{approach}"` (예: "prisma-upsert-pattern")

### troubleshoot (WHAT went wrong)
- 에러 → 근본 원인 → 해결 절차
- 제목: `"{error}-{solution}"` (예: "hmac-mismatch-fix")

### decision (WHY this way)
- 기술 선택의 근거, 트레이드오프
- 제목: `"adr-{topic}"` (예: "adr-redis-vs-memcached")

### anti-pattern (What NOT to do)
- 시도했다가 실패한 접근, 근본 원인
- 제목: `"avoid-{pattern}"` (예: "avoid-barrel-exports")

### 확신도 평가
- **높음**: 명확한 인과, 반복 검증
- **중간**: 합리적 추론, 1회 검증
- **낮음**: 가설 수준

## Phase 2: 품질 게이트 (5-Question Filter)

| # | 질문 | YES일 때 | NO일 때 |
|---|------|---------|---------|
| Q1 | Google에서 5분 안에 찾을 수 있는가? | 저장 안 함 | 통과 |
| Q2 | 이 코드베이스에만 해당하는가? | scope: project | scope: me |
| Q3 | WHY가 포함되어 있는가? | 통과 | WHY 추가 후 저장 |
| Q4 | 컨텍스트 없이 이해 가능한가? | 통과 | 컨텍스트 추가 |
| Q5 | 이미 compound에 있는가? | 기존 항목 업데이트 | 신규 저장 |

추가 거부: 일반론, 독성 패턴(@ts-ignore, --force), 단순 변경 세션

## Phase 3: 축적

```bash
# pattern
forgen compound --solution "{topic}-{approach}" "상세 설명 (WHY 포함)"

# troubleshoot
forgen compound --solution "{error}-{solution}" "에러 상황, 원인, 해결 절차"

# decision
forgen compound --solution "adr-{topic}" "대안, 선택 이유, 트레이드오프"

# anti-pattern
forgen compound --solution "avoid-{pattern}" "실패 원인, 대체 접근법"
```

## Phase 4: 리포트

```
세션 복리화 완료
─────────────────────────────────
추출: N개 솔루션
유형: pattern X개, troubleshoot Y개, decision Z개, anti-pattern W개
저장: ~/.forgen/me/solutions/
```

## Phase 5: Health Dashboard

```
COMPOUND HEALTH
════════════════════════════════════════════════════
Total: {N} solutions
|- mature (3+ hits):    {N} ({N}%)
|- verified (2 hits):   {N} ({N}%)
|- candidate (1 hit):   {N} ({N}%)
+- experiment (0 hits): {N} ({N}%) <- cleanup candidates

Hit Rate (7d): {N}%
Top Patterns: "{name}" ({N} hits), "{name}" ({N} hits)
Stale (30d+ unused): {N} -> /learn prune

Category: pattern {N} | troubleshoot {N} | decision {N} | anti-pattern {N}
Trend: {analysis}
════════════════════════════════════════════════════
```

### 건강 지표

| 지표 | 건강 | 주의 | 위험 |
|------|------|------|------|
| mature 비율 | > 30% | 15-30% | < 15% |
| experiment 비율 | < 20% | 20-40% | > 40% |
| hit rate (7d) | > 30% | 15-30% | < 15% |
| stale 수 | < 5 | 5-15 | > 15 |
</Steps>

<Failure_Modes>
NEVER: **일반론 추출**: 추상적 교훈 저장 금지. Q1에서 걸러집니다.

NEVER: **프로젝트 전용을 범용으로**: scope: project 명시 필수.

NEVER: **중복 추출**: Phase 0에서 기존 항목 확인 필수. Q5에서 걸러집니다.

NEVER: **"왜" 없는 추출**: Q3에서 걸러집니다.

NEVER: **단순 세션 억지 추출**: "복리화 불필요"로 종료.

NEVER: **카테고리 무시**: 4개 카테고리별 제목 형식 준수.

NEVER: **Health Dashboard 건너뛰기**: 추출 후 반드시 Phase 5 실행.
</Failure_Modes>

<Policy>
- Phase 0 중복 방지 검색을 반드시 먼저 실행
- 4개 카테고리로 분류 (pattern, troubleshoot, decision, anti-pattern)
- 5-Question Filter 모든 항목에 적용
- "왜" 없는 항목 저장 금지
- 카테고리별 제목 형식 준수
- 기존 항목 중복 시 업데이트 제안
- 단순 세션이면 "복리화 불필요"로 종료
- 추출 후 Health Dashboard 표시
</Policy>

<Arguments>
## 사용법
`compound {선택적 설명}`

### 예시
- `compound` — 전체 세션 분석
- `compound 인증 구현 관련` — 특정 주제 집중

### 인자
- 선택적: 특정 주제 키워드. 생략 시 전체 세션 분석.
</Arguments>

$ARGUMENTS
