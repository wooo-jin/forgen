---
name: code-review
description: This skill should be used when the user asks to "code review,코드 리뷰,리뷰해줘,review this". 신뢰도 보정 기반 체계적 코드 리뷰 — compound 이력 연동, auto-fix, 20개 체크리스트.
argument-hint: "[file, PR number, or git range]"
model: opus
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
  - Write
  - Agent
triggers:
  - "code review"
  - "코드 리뷰"
  - "리뷰해줘"
  - "review this"
  - "리뷰"
  - "review"
---

<Purpose>
변경된 코드의 품질, 보안, 유지보수성을 체계적으로 검증합니다.
모든 발견에 신뢰도 점수(1-10)를 부여하여 false positive를 최소화합니다.
auto-fix 가능한 항목은 직접 수정하고, 판단이 필요한 항목만 사용자에게 보고합니다.
</Purpose>

<Compound_Integration>
## Compound-In: 이전 리뷰 이력 로드

```
compound-search("{모듈명} {파일 경로 키워드} review 리뷰 이슈")
```

검색 결과가 있으면 보고서 상단에 표시합니다:

```
이전에 이 모듈에서 발견된 이슈:
- [{제목}] (심각도: {level}, 날짜: {date})
  해결 여부: {해결됨 / 미해결 / 재발}
```

재발 패턴: 같은 이슈 2회 이상 -> 심각도 자동 상향 (MEDIUM -> HIGH)

## Compound-Out: 발견사항 기록

- CRITICAL/HIGH -> compound troubleshoot 기록 제안
- 새 anti-pattern -> compound anti-pattern 기록 제안
</Compound_Integration>

<Confidence_Calibration>
## 신뢰도 보정 (모든 발견에 적용)

```
9-10: 코드를 읽고 검증함. 구체적 버그/취약점 시연 가능.
7-8:  높은 확신 패턴 매치. 거의 확실히 실제 이슈.
5-6:  중간. false positive 가능. 주의하여 플래그.
3-4:  낮음. 부록에만 포함.
1-2:  추측. P0 심각도일 때만 보고.
```

보고 임계값:
- 본문: 5 이상
- 부록: 3-4
- 1-2: P0 아니면 생략
</Confidence_Calibration>

<Steps>
## Phase 1: 스코프 파악

```bash
# 인수가 파일 경로 -> cat {path}
# 인수가 PR 번호 -> gh pr diff {number}
# 인수가 git range -> git diff {range}
# 인수 없음 -> git diff HEAD (또는 git diff --staged)
```

## Phase 2: Compound-In (이전 이력 확인)

```
compound-search("{모듈명 또는 핵심 키워드}")
```

## Phase 3: 체계적 검토 (20개 체크리스트)

### Security (6개)
- [ ] 하드코딩된 시크릿 없음
- [ ] 입력 살균 (SQL/NoSQL injection 방지)
- [ ] XSS 방지
- [ ] CSRF 보호
- [ ] 인증/인가 적용
- [ ] 민감 정보 로그 노출 없음

### Critical Category (5개)
- [ ] SQL/데이터 안전성
- [ ] 경쟁 조건
- [ ] LLM 신뢰 경계 (LLM 출력 살균 확인)
- [ ] 시크릿 노출 (코드 + 로그 + 에러 메시지)
- [ ] Enum 완전성 (새 값 -> 모든 switch/match 업데이트)

### Code Quality (5개)
- [ ] 함수 50줄 미만
- [ ] 순환 복잡도 10 미만
- [ ] 깊은 중첩 없음 (4단계 -> early return)
- [ ] DRY 원칙
- [ ] 서술적 네이밍

### Performance (4개)
- [ ] N+1 없음
- [ ] 적절한 캐싱
- [ ] 효율적 알고리즘
- [ ] 불필요한 리렌더링 없음

## Phase 4: Auto-Fix 적용

**AUTO-FIX** (묻지 않고 수정):
- 데드 코드, 미사용 import, stale 주석, 빈 catch 블록

**ASK** (사용자 판단):
- 로직 변경, 아키텍처 리팩토링, 동작 변경

## Phase 5: 보고서 작성

신뢰도 점수 + 심각도별 분류.
</Steps>

<Finding_Format>
```
[P{N}] (confidence: {N}/10) `{file}:{line}`
  Issue: {구체적 문제}
  Impact: {영향}
  Fix: {수정 방안}
```
</Finding_Format>

<Failure_Modes>
**스타일만 리뷰하고 로직 생략**: 네이밍/들여쓰기만 지적하고 비즈니스 로직, 엣지 케이스, 동시성은 검토하지 않는다.
**파일:라인 없는 피드백**: 모든 이슈에 `파일명:라인번호` 필수.
**숨겨진 BLOCKER + APPROVE**: CRITICAL/HIGH 발견 시 APPROVE 불가.
**신뢰도 없는 발견**: 모든 발견에 1-10 신뢰도 필수.
**Auto-fix에서 로직 변경**: 데드 코드/import/주석만 자동 수정. 비즈니스 로직 자동 변경 금지.
**LLM 출력 무조건 신뢰**: LLM 출력 처리 코드는 신뢰 경계 검사 필수.
</Failure_Modes>

<Output>
```
CODE REVIEW REPORT / 코드 리뷰 리포트
======================================
Scope: {리뷰 대상}
Files: {N}개 | Lines: +{N} / -{N}

[COMPOUND HISTORY]
- {이전 이슈} ({날짜}) -- {상태}

CRITICAL ({N})
──────────────
[P0] (confidence: {N}/10) `{file}:{line}`
  Issue: ...
  Impact: ...
  Fix: ...

HIGH ({N})
──────────
...

MEDIUM ({N})
────────────
...

LOW ({N})
─────────
...

AUTO-FIXED ({N})
────────────────
- {수정 내용} ({file}:{line})

APPENDIX (confidence 3-4)
─────────────────────────
- {낮은 신뢰도 항목}

VERDICT: {APPROVE / REQUEST CHANGES / COMMENT}
{판정 근거}
```

| 판정 | 조건 |
|------|------|
| APPROVE | CRITICAL/HIGH 0개 |
| REQUEST CHANGES | CRITICAL 1+ 또는 HIGH 2+ |
| COMMENT | HIGH 1개 또는 MEDIUM만 |
</Output>

<Policy>
- 변경된 코드만 리뷰 (기존 기술 부채는 별도 이슈).
- 모든 이슈에 `파일:라인` + 신뢰도 필수.
- 문제 + 수정 방안을 함께 제시.
- 20개 체크 항목 빠짐없이 검토.
- Auto-fix는 안전한 항목에만.
- CRITICAL/HIGH 발견 시 APPROVE 불가.
</Policy>

<Arguments>
## 사용법
`/code-review {대상}`

### 예시
- `/code-review` (git diff HEAD)
- `/code-review src/auth/login.ts`
- `/code-review 42` (PR #42)
- `/code-review HEAD~3..HEAD`

### 인자
- 파일 경로, PR 번호, git range
- 생략 시 git diff 자동 감지
</Arguments>

$ARGUMENTS
