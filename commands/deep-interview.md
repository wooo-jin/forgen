---
name: deep-interview
description: This skill should be used when the user asks to "deep-interview,딥인터뷰,심층인터뷰,deep interview". Deep requirement interview with weighted dimension scoring, challenge modes, and ontology tracking
argument-hint: "[project or feature description]"
triggers:
  - "deep-interview"
  - "딥인터뷰"
  - "심층인터뷰"
  - "deep interview"
  - "요구사항 인터뷰"
---

<Purpose>
프로젝트의 요구사항을 체계적으로 심층 인터뷰하여 모호성을 제거합니다.
가중 차원 점수(Weighted Dimension Scoring)로 모호성을 정량화하고,
한 번에 하나의 질문만 던져 깊이 있는 답변을 이끌어냅니다.
목표: ambiguity <= 0.20 (20% 이하)까지 인터뷰를 진행합니다.
</Purpose>

<Compound_Integration>
## 시작 전: compound-search로 이전 인터뷰 검색

인터뷰 시작 전 반드시 compound-search MCP 도구로 유사한 프로젝트의 이전 인터뷰를 검색합니다.

```
compound-search("[프로젝트명 또는 핵심 도메인 키워드]")
```

검색 결과가 있으면 인터뷰 시작 시 표시합니다:

```
이전 인터뷰 발견:
- [프로젝트명]: [핵심 토픽] (최종 ambiguity: 0.XX)
- 재사용 가능한 결정사항: [패턴/결론]
- 이전 인터뷰에서 해결된 항목은 이번에 건너뜁니다.
```

## 진행 중: 관련 compound 솔루션 로드

질문 주제와 관련된 compound 솔루션이 있으면 더 정확한 질문을 구성합니다.

## 종료 후: 인터뷰 결과를 compound로 저장

```bash
forgen compound --solution "interview-{project}-spec" "인터뷰 결과 명세서 전문"
```
</Compound_Integration>

<Steps>
## Phase 0: 프로젝트 유형 감지

사용자 요청을 분석하여 프로젝트 유형을 자동 판별합니다.

### Greenfield (새 프로젝트)
- 채점 공식: `ambiguity = 1 - (goal * 0.40 + constraints * 0.30 + criteria * 0.30)`

### Brownfield (기존 코드베이스 확장/수정)
- Glob/Grep/Read로 기존 코드베이스를 탐색하여 기술 컨텍스트를 자동 수집
- 채점 공식: `ambiguity = 1 - (goal * 0.35 + constraints * 0.25 + criteria * 0.25 + context * 0.15)`

### 자동 감지 절차
```
1. 현재 디렉토리에 package.json, tsconfig.json, go.mod 등이 있는가?
2. git log가 존재하는가?
3. 사용자 요청에 "기존", "현재", "수정", "추가" 등의 키워드가 있는가?
→ 2개 이상 해당하면 Brownfield → 아니면 Greenfield
```

## Phase 1: 차원 초기 채점

각 차원을 0.0 ~ 1.0 범위로 채점합니다 (1.0 = 완전히 명확, 0.0 = 전혀 모름).

### Greenfield 차원 (3개)
| 차원 | 가중치 | 의미 |
|------|--------|------|
| **goal** | 0.40 | 무엇을 만드는가? 최종 산출물은? 성공 기준은? |
| **constraints** | 0.30 | 기술 제약, 시간, 예산, 팀 역량, 비기능 요구사항 |
| **criteria** | 0.30 | 완료 기준, 수용 기준, 테스트 가능한 조건 |

### Brownfield 추가 차원 (1개)
| 차원 | 가중치 | 의미 |
|------|--------|------|
| **context** | 0.15 | 기존 아키텍처, 의존성, 코드 패턴, 데이터 모델 |

### 채점 기준 상세

**goal (가중치 0.40)**
- 최종 산출물이 명확한가? (0.0~1.0)
- 핵심 기능이 열거되었는가? (0.0~1.0)
- 사용자/대상이 특정되었는가? (0.0~1.0)
- 비즈니스 근거(왜 만드는가)가 있는가? (0.0~1.0)

**constraints (가중치 0.30)**
- 기술 스택이 결정되었는가? (0.0~1.0)
- 비기능 요구사항이 정의되었는가? (0.0~1.0)
- 일정/예산 제약이 있는가? (0.0~1.0)
- 외부 연동/의존성이 파악되었는가? (0.0~1.0)

**criteria (가중치 0.30)**
- 수용 기준이 테스트 가능한 형태인가? (0.0~1.0)
- 엣지 케이스가 고려되었는가? (0.0~1.0)
- 비정상 시나리오 대응이 정의되었는가? (0.0~1.0)

**context (가중치 0.15, Brownfield만)**
- 기존 아키텍처를 파악했는가? (0.0~1.0)
- 영향받는 모듈/파일을 식별했는가? (0.0~1.0)
- 기존 테스트 커버리지를 확인했는가? (0.0~1.0)
- 기존 코드 패턴을 이해했는가? (0.0~1.0)

## Phase 2: 인터뷰 루프 (라운드 기반)

### 질문 프로토콜 -- 반드시 한 번에 하나의 질문만

매 라운드마다:
1. **가장 약한 차원 식별**: 가중 점수가 가장 낮은 차원을 선택
2. **질문 하나만 생성**: 해당 차원의 점수를 가장 효과적으로 올릴 수 있는 질문
3. **표시 형식**:
   ```
   Round N | ambiguity: 0.XX | 목표 차원: {dimension}
   ─────────────────────────────────────────────────
   Q. [구체적이고 개방형 질문]
   (이 답변으로 {dimension} 점수 +0.X 예상)
   ```
4. **답변 수신 후**: 점수 재산정 -> 보드 갱신 -> 다음 라운드

### Push Until Evidence 규칙

모호한 답변("대충", "아마", "비슷한") → 같은 차원에서 후속 질문.
가정 기반 답변("아마 ~일 거예요") → "확인된 사실인가요, 검증이 필요한 가정인가요?"
범위 미정 답변("다 되면 좋겠어요") → "MVP 범위에서 반드시 포함해야 하는 3가지는?"

## Phase 3: 챌린지 모드 (라운드 기반 자동 활성화)

### Round 4+: Contrarian (반론 모드)
"만약 정반대가 사실이라면?" — 사용자의 전제를 뒤집어 검증합니다.

### Round 6+: Simplifier (단순화 모드)
"가장 단순하면서도 가치있는 버전은?" — 불필요한 복잡성을 제거합니다.

### Round 8+ (ambiguity > 0.30): Ontologist (본질 탐구 모드)
"이것은 본질적으로 무엇인가요?" — 핵심 엔티티의 정의와 경계를 명확히 합니다.

## Phase 4: 온톨로지 추적

매 라운드마다 핵심 엔티티(명사)를 추적합니다.
```
ONTOLOGY TRACKER
──────────────────────────────────────
Entity          | First  | Last  | Status
User            | R1     | R5    | stable
Order           | R1     | R6    | refined
──────────────────────────────────────
Stability: 3/4 (75%)
```
- stability_ratio >= 0.90: 도메인 모델 안정 -> 종료 가능
- stability_ratio < 0.70: 유동적 -> 본질 질문 필요
</Steps>

## 반아첨(Anti-Sycophancy) 규칙

| 금지 표현 | 대체 행동 |
|-----------|-----------|
| "좋은 접근이네요" | 입장을 취합니다. 근거와 함께 동의 또는 반대. |
| "그것도 될 수 있어요" | 근거를 바탕으로 된다/안 된다 판단. |
| "고려해 보시면..." | "이것은 틀렸습니다. 이유는..." 또는 "이것이 맞습니다. 이유는..." |
| "흥미로운 접근이네요" | "이 접근은 {구체적 이유}로 {성공/실패}할 것입니다." |

사용자가 틀렸으면 틀렸다고 말합니다. 근거를 함께 제시합니다.

## Ambiguity Score 보드

```
DEEP INTERVIEW BOARD
═══════════════════════════════════════════════════
Project: {name}  |  Type: {Greenfield/Brownfield}
Round: {N}  |  Ambiguity: {0.XX}  |  Target: <= 0.20

DIMENSION SCORES
────────────────────────────────────────────────────
 Dimension    Weight   Score    Weighted    Trend
 goal         0.40     0.75     0.300       0.2->0.5->0.75 ++
 constraints  0.30     0.50     0.150       0.1->0.50 +
 criteria     0.30     0.30     0.090       0.3 NEW
────────────────────────────────────────────────────
 Clarity: 0.540 | Ambiguity: 0.460 | Status: Continue

ONTOLOGY ({N} entities, {stability}% stable)
ACTIVE CHALLENGE: {None / CONTRARIAN / SIMPLIFIER / ONTOLOGIST}
═══════════════════════════════════════════════════
```

## 종료 조건

| 조건 | 기준 |
|------|------|
| **Ready** | ambiguity <= 0.20 |
| **Conditional** | 0.20 < ambiguity <= 0.35 |
| **User Exit** | 사용자 요청 (경고 표시 후 종료) |
| **Plateau** | 3라운드 연속 변화 < 0.05 -> Ontologist 전환 |
| **Hard Cap** | 20라운드 도달 -> 강제 종료 |

라운드 제한: 최소 3, 소프트 캡 10, 하드 캡 20.

## 실행 브릿지

```
ambiguity <= 0.20 -> "준비 완료. 권장: /forge-loop"
ambiguity 0.20~0.35 -> "가정 목록 확인 필요. 확인 후 /forge-loop"
ambiguity > 0.35 -> "인터뷰 계속 필요."
```

## 최종 명세서 형식

```markdown
# Deep Interview Spec: {title}
## Metadata (rounds, score, type, timestamp)
## Clarity Breakdown (dimension scores table)
## Goal
## Constraints
## Non-Goals
## Acceptance Criteria (testable)
## Assumptions (exposed & resolved)
## Technical Context
## Key Entities (ontology table)
## Ontology Convergence (round-by-round stability)
## Next Action: /forge-loop | /ch-architecture-decision | manual
```

<Failure_Modes>
## 피해야 할 실패 패턴

NEVER: **한 번에 여러 질문**: 질문은 반드시 1개. 2개 이상 금지.

NEVER: **코드에서 답을 찾을 수 있는 것을 질문**: Brownfield에서 Read/Grep으로 먼저 확인.

NEVER: **보드 갱신 누락**: 매 라운드 종료 후 반드시 보드 표시.

NEVER: **아첨/동의 기본값**: 근거 없는 동의 금지. 모든 판단에 근거 필요.

NEVER: **모호한 답변 수용**: Push Until Evidence 규칙 적용.

NEVER: **3라운드 전 종료**: 경고 표시 필수.

NEVER: **챌린지 모드 건너뛰기**: Round 4+ 이후 반드시 적용.
</Failure_Modes>

<Policy>
- 라운드당 질문은 반드시 1개만 (깊이 > 넓이)
- 가장 낮은 가중 점수의 차원부터 공략
- 답변 후 즉시 점수 재산정 + 보드 갱신
- 사용자가 "모르겠다" -> 해당 요소 0.0 유지, 다음 질문
- 기술적 판단 가능한 항목 -> 합리적 가정 제안
- 비즈니스 판단 필요 항목 -> 반드시 사용자 확인
- Anti-Sycophancy 규칙 준수
- Brownfield -> 코드 탐색 선행, context 차원 자동 채점
- 온톨로지 추적 매 라운드 수행
</Policy>

<Arguments>
## 사용법
`deep-interview {프로젝트 또는 기능 설명}`

### 예시
- `deep-interview 이커머스 플랫폼 MVP`
- `deep-interview 사내 HR 시스템 리뉴얼`
- `deep-interview 실시간 채팅 기능 추가`

### 인자
- 인터뷰할 프로젝트 또는 기능의 자연어 설명
- 기존 코드베이스가 있으면 Brownfield로 자동 전환
</Arguments>

$ARGUMENTS
