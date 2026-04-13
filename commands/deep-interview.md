---
name: deep-interview
description: This skill should be used when the user asks to "deep-interview,딥인터뷰,심층인터뷰,deep interview". Deep requirement interview with Ambiguity Score quantification
triggers:
  - "deep-interview"
  - "딥인터뷰"
  - "심층인터뷰"
  - "deep interview"
---

<Purpose>
프로젝트의 핵심 주제들을 체계적으로 심층 인터뷰하여 모호성을 제거합니다.
각 주제에 Ambiguity Score(0-10)를 부여하여 어디가 명확하고 어디가 불분명한지를
정량적으로 보여줍니다. 반복 질문을 통해 모든 주제의 점수를 3 이하로 낮추는 것이 목표입니다.
</Purpose>

<Steps>
1. **주제 추출**: 사용자 요청에서 핵심 주제(Topic)를 5-8개 식별합니다
   - 기능 범위 (Scope)
   - 사용자 시나리오 (User Flow)
   - 데이터 모델 (Data)
   - 기술 제약 (Tech Constraints)
   - 엣지 케이스 (Edge Cases)
   - 성능 요구 (Performance)
   - 보안 요구 (Security)
   - 배포/운영 (Operations)

2. **초기 Ambiguity Score 산정**: 각 주제별 0-10 점수를 부여합니다

3. **라운드 기반 인터뷰**: 가장 높은 점수의 주제부터 질문합니다
   - 한 라운드에 최대 3개 질문
   - 답변 후 점수를 재산정하고 보드를 갱신
   - 점수가 3 이하가 될 때까지 반복

4. **최종 보고서**: 인터뷰 결과를 구조화된 명세로 정리합니다
</Steps>

## Ambiguity Score 체계

| 점수 | 레벨 | 의미 | 구현 가능 여부 |
|------|------|------|---------------|
| **0** | Crystal | 완벽히 명확. 코드로 즉시 변환 가능. | 즉시 가능 |
| **1-2** | Clear | 사소한 세부사항만 미정. 합리적 가정으로 진행 가능. | 가능 |
| **3** | Mostly Clear | 한두 가지 선택지가 남음. 가정을 명시하면 진행 가능. | 조건부 가능 |
| **4-5** | Hazy | 핵심 결정이 1-2개 미정. 가정 위험이 있음. | 위험 감수 시 가능 |
| **6-7** | Foggy | 주요 방향이 불확실. 잘못된 가정 시 재작업 발생. | 비권장 |
| **8-9** | Opaque | 요구사항의 대부분이 미정. 프로토타입 수준만 가능. | 불가 |
| **10** | Black Box | 무엇을 만들어야 하는지조차 불명확. | 불가 |

### 점수 산정 기준 (5가지 축)

각 축을 0-2점으로 평가하여 합산합니다:

| 축 | 0점 (명확) | 1점 (부분 모호) | 2점 (모호) |
|----|-----------|----------------|-----------|
| **What** (무엇을) | 기능이 구체적으로 정의됨 | 기능의 범위가 애매함 | 무엇을 만드는지 불명확 |
| **Who** (누구를 위해) | 대상 사용자가 특정됨 | 대상 사용자가 넓게 정의됨 | 사용자가 누구인지 모름 |
| **How** (어떻게) | 기술 구현 방식이 결정됨 | 후보 기술이 있으나 미결정 | 구현 방식을 모름 |
| **When** (언제까지) | 기한과 우선순위가 명확함 | 대략적 일정만 있음 | 기한/우선순위 미정 |
| **Why** (왜) | 비즈니스 근거가 명확함 | 근거가 있으나 검증 안 됨 | 왜 필요한지 불분명 |

## 인터뷰 보드 형식

```
DEEP INTERVIEW BOARD / 심층 인터뷰 보드
========================================

Project: [프로젝트명]
Round: [N]  |  Overall Ambiguity: [가중평균 점수]  |  Status: [진행중/완료]

TOPIC SCORES
────────────────────────────────────────────────
 #  Topic              Score  W  H  Wh When Why  Trend
 1  User Authentication  3/10  0  1   1   0   1   8→5→3 ↓
 2  Payment Flow         7/10  1  2   2   1   1   9→7 ↓
 3  Data Model           2/10  0  0   1   0   1   6→2 ↓↓
 4  Error Handling       5/10  1  1   1   1   1   5 —
 5  Performance          8/10  2  2   2   1   1   8 NEW
────────────────────────────────────────────────
                    Avg: 5.0

LEGEND: W=What, H=How, Wh=Who, Trend: ↓=improving ↑=worsening —=no change

CURRENT ROUND QUESTIONS
────────────────────────
[Targeting: #5 Performance (8/10), #2 Payment Flow (7/10)]

Q1. [#5-How] 예상 동시 접속자 수와 초당 요청량(RPS)은?
    → 이 답변으로 Performance Score -2 예상

Q2. [#2-What] 결제 수단은 카드만? 계좌이체/간편결제도 포함?
    → 이 답변으로 Payment Score -1~2 예상

Q3. [#2-How] PG사는 결정되었나요? (토스/아임포트/스트라이프 등)
    → 이 답변으로 Payment Score -1~2 예상

RESOLVED SO FAR
───────────────
- [#1] JWT 기반 인증, 만료 15분, 리프레시 토큰 7일
- [#3] PostgreSQL, users/orders/payments 3테이블
- [#1] bcrypt 해싱, salt rounds 12

[답변을 입력하면 점수를 재산정합니다]
```

## 종료 조건

인터뷰는 다음 조건 중 하나를 만족하면 종료합니다:

| 조건 | 설명 |
|------|------|
| **All Clear** | 모든 주제가 3점 이하 |
| **Actionable** | 평균 점수 3.5 이하 + 7점 이상 주제 없음 |
| **User Exit** | 사용자가 "충분해", "진행하자" 등으로 종료 요청 |
| **Plateau** | 3라운드 연속 총점 변화 없음 (더 이상 정보 획득 불가) |

종료 시 자동으로 최종 명세서를 생성합니다.

## 최종 보고서 형식

```
DEEP INTERVIEW REPORT / 심층 인터뷰 결과
=========================================

Total Rounds: [N]
Final Ambiguity: [가중평균] (초기: [초기 평균] → 최종: [최종 평균])
Score Reduction: [감소량] ([감소율]%)

TOPIC SUMMARY
─────────────
[각 주제별 최종 점수 + 핵심 결정사항 1-2줄]

REMAINING ASSUMPTIONS
─────────────────────
[점수 1-3인 항목의 가정 목록 — 검증 필요]

IMPLEMENTATION READY
────────────────────
[점수 0인 항목 → 즉시 구현 가능한 명세]

NEXT ACTIONS
────────────
1. [가장 시급한 미결 사항]
2. [두 번째 미결 사항]
```

<Policy>
- 라운드당 최대 3개 질문만 합니다 (질문 피로도 방지)
- 가장 높은 Ambiguity Score 주제부터 우선 공략합니다
- 답변 후 즉시 점수를 재산정하여 진행 상황을 보여줍니다
- 각 질문에 예상 점수 감소량을 표시하여 질문의 가치를 투명하게 합니다
- 사용자가 "모르겠다"고 하면 해당 축을 2점으로 유지하고 다음 질문으로 넘어갑니다
- 기술적 판단이 가능한 축(How)은 합리적 가정을 제안하여 점수를 낮춥니다
- 비즈니스 판단이 필요한 축(What, Who, Why)은 반드시 사용자 확인을 구합니다
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
- 기존 코드베이스가 있으면 자동으로 기술 제약 주제의 점수를 낮춤
</Arguments>

$ARGUMENTS
