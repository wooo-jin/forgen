---
name: architecture-decision
description: This skill should be used when the user asks to "adr,architecture decision,아키텍처 결정,설계 결정,기술 결정". ADR 생성 -- 대안 평가, 가중 트레이드오프 매트릭스, 결정 라이프사이클 관리
argument-hint: "[결정 주제]"
model: opus
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - mcp__forgen-compound__compound-search
  - mcp__forgen-compound__compound-read
  - mcp__forgen-compound__compound-list
triggers:
  - "adr"
  - "architecture decision"
  - "아키텍처 결정"
  - "설계 결정"
  - "기술 결정"
---

<Purpose>
아키텍처 결정 기록(ADR)을 체계적으로 작성합니다.
의사결정의 컨텍스트, 대안 평가, 가중 트레이드오프 매트릭스, 결과를 구조화하여 기록하고
미래의 개발자가 "왜 이렇게 결정했는가"를 이해할 수 있도록 합니다.

핵심 차별점:
- 정량적 가중 트레이드오프 매트릭스 (직관이 아닌 점수)
- ADR 라이프사이클 관리 (Proposed → Accepted → Deprecated → Superseded)
- Type 1/Type 2 가역성 분류에 따른 분석 심도 조절
- Compound를 통한 결정 이력 추적 및 일관성 보장
</Purpose>

<Compound_Integration>
## 시작 전: 이전 ADR 및 결정 이력 검색

결정을 내리기 전에 compound-search MCP 도구로 유사한 과거 결정을 검색합니다.

```
compound-search("[결정 주제 키워드]")
compound-search("아키텍처 결정 [관련 기술명]")
```

### 검색 결과가 있을 경우
컨텍스트 섹션 앞에 이전 결정을 표시합니다:
```
이전에 유사한 결정:
- [ADR 제목]: [핵심 결론 요약] (날짜: YYYY-MM-DD)
- 당시 선택한 이유: [주요 근거]
- 현재와의 차이점: [컨텍스트 변화가 있으면 명시]
```

같은 주제의 이전 결정이 있으면:
"Note: 이전에 이 주제에 대한 결정이 있습니다 (ADR-{N}). 변경하려면 Supersede 사유가 필요합니다."

### 완료 후: 결정 축적
ADR 작성이 완료되면 compound에 결정 핵심 요약을 저장합니다.
</Compound_Integration>

<Steps>
## 6단계 ADR 프로세스

### Step 1: Context (컨텍스트)
- 해결하려는 문제/요구사항 정의
- 현재 시스템 상태 및 제약 조건
- 비기능 요구사항 (성능, 보안, 확장성, 비용)

### Step 2: Alternatives (대안 탐색)
- 최소 2개 실질 대안 (반드시 "최소형"과 "이상형" 각 1개 포함)
- "현상 유지" 옵션 포함
- 각 대안의 장단점, 호환성, 비용

### Step 3: Trade-off Matrix (가중 트레이드오프 매트릭스)
```
| 기준             | 가중치 | Option A | Option B | Option C |
|------------------|--------|----------|----------|----------|
| 성능             | 30%    | ★★★    | ★★      | ★★★★  |
| 복잡도           | 25%    | ★★      | ★★★★  | ★       |
| 유지보수성       | 25%    | ★★★    | ★★★    | ★★      |
| 마이그레이션 비용 | 20%    | ★★★★  | ★★      | ★       |
| 가중 합계        | 100%   | 2.95     | 2.85     | 2.15     |
```
규칙: 기준 4~6개, 가중치 합계 100%, 점수 통일, 산술 검증 필수.

### Step 4: Decision (결정)
- 선택된 대안과 핵심 이유
- 수용한 트레이드오프 명시
- 거부된 대안과 거부 이유

### Step 5: Consequences (결과 분석)
- Positive/Negative/Risks + 완화 전략
- Follow-up decisions

### Step 6: Reversibility (가역성 분류)
- Type 1 (비가역): 심층 분석, PoC 권장, Reversal condition 필수
- Type 2 (가역): 신속 결정, 결과로 검증
</Steps>

<Failure_Modes>
## 피해야 할 실패 패턴

- 대안 없는 결정: 최소형+이상형을 포함한 2개 이상 실질 대안 없이 단순 선언으로 끝냄.
- 트레이드오프 누락: 장점만 나열하고 수용한 단점과 리스크를 기록하지 않음.
- 가역성 미검토: Type 1/Type 2 분류를 생략하여 비가역 결정에 충분한 분석 없이 결론.
- 가중치 합계 오류: 가중치 합계가 100%가 아니거나 가중 합계 산술이 틀림.
- 이전 ADR 무시: compound에 같은 주제의 이전 결정이 있는데 참조하지 않음.
- ADR 상태 미관리: Superseded된 ADR의 상태를 업데이트하지 않아 충돌 발생.
</Failure_Modes>

<Output>
```markdown
# ADR-{N}: {Title}

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-{M}
**Date**: YYYY-MM-DD
**Reversibility**: Type 1 (비가역) | Type 2 (가역)

## Context
{상황과 배경}

## Alternatives Considered
### Option A: {name} (최소형)
### Option B: {name} (이상형)
### Option C: 현상 유지

## Trade-off Matrix
| 기준 | 가중치 | Option A | Option B | Option C |
|------|--------|----------|----------|----------|
| ...  | ...    | ...      | ...      | ...      |

## Decision
**Option {X}를 선택합니다.**
Trade-offs accepted: ...
Reversal condition: ...

## Consequences
Positive / Negative / Risks / Follow-up

## Related
- Supersedes: ADR-{M}
- Review date: YYYY-MM-DD
```
</Output>

<Policy>
- 최소 2개 실질 대안 비교 (최소형 + 이상형 필수)
- 가중 트레이드오프 매트릭스 가중치 합계 100%, 산술 검증
- 트레이드오프를 명시적으로 기록 -- 모든 결정에는 대가가 있음
- Type 1 결정에는 Reversal condition 필수
- 이전 ADR 검색 후 관계 명시 (Supersede 등)
- ADR은 코드와 함께 버전 관리 (docs/adr/)
- 폐기된 ADR도 삭제하지 않음 -- 역사적 맥락 보존
</Policy>

## ADR 라이프사이클

```
[Proposed] → [Accepted] → [Deprecated] | [Superseded by ADR-{M}]
```

## 다른 스킬과의 연동
- `/forgen:code-review` -- ADR에 따른 구현 검증
- `/forgen:documentation` -- ADR 기반 아키텍처 문서 작성
- `/forgen:security-review` -- 아키텍처 결정의 보안 관점 검토

<Arguments>
## 사용법
`/forgen:architecture-decision {결정 주제}`

### 예시
- `/forgen:architecture-decision 상태 관리 라이브러리 선택`
- `/forgen:architecture-decision 모놀리스 → 마이크로서비스 전환`
- `/forgen:architecture-decision 인증 방식 결정 (JWT vs Session)`
- `/forgen:architecture-decision 데이터베이스 선택 (PostgreSQL vs MongoDB)`

### 인자
- 결정이 필요한 주제, 배경, 제약 조건 등을 설명
- 인자 없으면 현재 프로젝트에서 문서화가 필요한 아키텍처 결정을 식별
</Arguments>

$ARGUMENTS
