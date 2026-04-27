---
name: learn
description: This skill should be used when the user asks to "learn, 학습 관리, compound 정리, 솔루션 정리". Compound 지식의 관리 인터페이스 — 검색, 통계, 가지치기, 내보내기/가져오기.
argument-hint: "[search {query}|stats|prune|export|import {path}]"
model: inherit
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
triggers:
  - "learn"
  - "학습 관리"
  - "compound 정리"
  - "솔루션 정리"
  - "compound 관리"
  - "솔루션 관리"
  - "지식 관리"
---

<Purpose>
compound에 축적된 솔루션을 관리합니다.
시간이 지남에 따라 솔루션은 낡거나 중복되거나 모순됩니다.
learn은 이를 정기적으로 정리하여 compound의 신호 대 잡음 비율을 유지합니다.

서브커맨드: search, stats, prune, export, import
서브커맨드 생략 시: stats 실행
</Purpose>

<Compound_Integration>
## Compound 데이터 직접 조작

learn은 compound의 관리 도구입니다.
모든 서브커맨드에서 compound MCP 도구를 직접 사용합니다:
- `compound-stats` -- 전체 현황 조회
- `compound-list` -- 솔루션 목록 조회
- `compound-read` -- 개별 솔루션 상세 조회
- `compound-search` -- 키워드 검색

retire/merge 전에 반드시 사용자 확인을 받습니다.
mature 상태 솔루션은 어떤 경우에도 자동 정리 대상이 아닙니다.
</Compound_Integration>

<Steps>
## search {query}

compound-search MCP로 검색하고 결과를 정리합니다.

```
compound-search("{query}")
```

```
SEARCH RESULTS / 검색 결과
===========================
Query: "{query}"
Found: {N}개

  # | Title                    | Type          | Status     | Last Used
----+--------------------------|---------------|------------|----------
  1 | {제목}                   | {type}        | {status}   | {date}
  2 | {제목}                   | {type}        | {status}   | {date}
```

결과 없으면: "검색 결과 없음. 관련 키워드 제안: {1-3개}"

---

## stats

```
compound-stats
compound-list
```

```
COMPOUND KNOWLEDGE / 복리 지식 현황
════════════════════════════════════
Total: {N} solutions

By Status:
  mature (3+ hits):     {N} ({N}%) {bar}
  verified (2 hits):    {N} ({N}%) {bar}
  candidate (1 hit):    {N} ({N}%) {bar}
  experiment (0 hits):  {N} ({N}%) {bar}

By Type:
  pattern: {N} | troubleshoot: {N} | decision: {N} | anti-pattern: {N}

By Scope:
  me: {N} | project: {N} | universal: {N}

Activity (last 7 days):
  Injected: {N}/{total} ({N}%)
  New: +{N} | Promoted: +{N} | Retired: -{N}
  Top: "{title}" ({N} hits)
```

바 차트는 비율에 따라 `#` 문자로 시각화 (최대 20자).

---

## prune

**prune은 항상 stats를 먼저 실행합니다.**

### 감지 기준
1. STALE: 30일+ 미사용
2. DUPLICATE: 유사도 80%+ (제목+내용 키워드 비교)
3. CONTRADICTORY: 같은 주제에 서로 반대 결론
4. LOW-QUALITY: experiment 상태 60일+ 미승격

### 제외 규칙
- mature 상태는 절대 prune 대상이 아님
- verified 상태는 STALE일 때만 후보

```
PRUNE CANDIDATES / 정리 후보
════════════════════════════

STALE (30d+ unused):
  1. "{title}" ({N}일 미사용)                    [retire / keep]
  2. "{title}" ({N}일 미사용)                    [retire / keep]

DUPLICATE (similarity {N}%+):
  3. "{title-a}" ~ "{title-b}" ({N}%)            [merge / keep both]

CONTRADICTORY:
  4. "{title-a}" vs "{title-b}"                  [resolve / keep both]

LOW-QUALITY (experiment {N}d+):
  5. "{title}" (experiment {N}일 경과)           [retire / promote / keep]

선택하세요 (번호 + 행동, 예: "1 retire, 3 merge, 4 resolve"):
```

사용자 선택을 받은 후에만 실행합니다.

---

## export

```bash
# tar.gz (기본)
tar -czf compound-export-$(date +%Y%m%d).tar.gz ~/.forgen/me/solutions/

# markdown (--md 인수)
# 각 솔루션을 하나의 markdown으로 결합
```

```
EXPORT COMPLETE / 내보내기 완료
================================
Format: {tar.gz / markdown}
File:   {파일 경로}
Size:   {크기}
Count:  {솔루션 수}
```

---

## import {path}

```bash
tar -xzf {path} -C /tmp/compound-import/
```

중복 검사 후 처리:
- 동일 -> skip
- 유사 -> 사용자에게 merge/skip/replace 선택
- 신규 -> 추가

```
IMPORT RESULTS / 가져오기 결과
===============================
Source: {path}
Total:  {N}개
  Added:    {N}개
  Skipped:  {N}개 (중복)
  Merged:   {N}개
```
</Steps>

<Failure_Modes>
**확인 없이 retire**: 각 후보의 선택을 반드시 사용자에게 받는다. 자동 삭제 없음.
**mature 솔루션 삭제 제안**: mature는 prune 대상에서 제외. 3회 이상 활용된 지식은 가치가 검증됨.
**stats 없이 prune**: stats 먼저, 그 다음 prune 후보. 전체 맥락 없이 개별 삭제 불가.
**import 무조건 덮어쓰기**: 기존 솔루션과 충돌 시 반드시 중복 검사 먼저.
**빈 compound에서 prune 시도**: 솔루션이 없으면 "/compound로 세션 패턴을 축적하세요" 안내.
</Failure_Modes>

<Output>
## stats 출력

```
COMPOUND KNOWLEDGE / 복리 지식 현황
════════════════════════════════════
Total: {N} solutions
...
```

## prune 출력

```
PRUNE CANDIDATES / 정리 후보
════════════════════════════
[stale] "{title}" -- {N}일 미사용 -> retire/keep?
[duplicate] "{a}" ~ "{b}" -> merge/keep?
[low-quality] "{title}" -- experiment {N}일 -> retire/promote/keep?
```
</Output>

<Policy>
- retire/merge는 반드시 사용자 확인 후 실행.
- mature 상태 솔루션은 prune 대상이 아님. 예외 없음.
- prune은 항상 stats 출력 이후에 후보 제시.
- export는 현재 디렉토리에 날짜 포함 파일명.
- import는 중복 검사 먼저, 충돌 시 사용자 선택.
- 서브커맨드 없으면 stats 기본 실행.
</Policy>

<Arguments>
- `search {query}`: 솔루션 검색
- `stats`: 전체 현황 통계 (기본값)
- `prune`: stale/중복/모순/저품질 감지 및 정리
- `export`: tar.gz 내보내기
- `export --md`: markdown 내보내기
- `import {path}`: 외부 compound 가져오기 (중복 검사 후 머지)
</Arguments>

$ARGUMENTS
