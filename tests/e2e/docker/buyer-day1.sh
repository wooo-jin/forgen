#!/bin/bash
# forgen v0.4.1 — 구매자 첫날 경험 시뮬
# 클린 ~/.forgen/ + OAuth mount 컨테이너에서 실제 개발 task 3 라운드.
# 목표: hook/skill/compound 가 "사용자 의도 대비 가치 있게 동작"하는지 실증.

set -uo pipefail

PASS=0; FAIL=0; WARN=0
pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }

echo ""
echo "═══════════════════════════════════════════════════"
echo "  forgen — 구매자 첫날 시나리오 (Buyer Day-1)"
echo "═══════════════════════════════════════════════════"

# 사전 점검 — forgen CLI / Claude CLI / OAuth
command -v forgen >/dev/null || { echo "FATAL: forgen CLI missing"; exit 1; }
command -v claude >/dev/null || { echo "FATAL: claude CLI missing"; exit 1; }
[ -f /root/.claude.json ] || { echo "FATAL: OAuth not mounted"; exit 1; }

# 클린 확인 — ~/.forgen 없어야 신규 사용자
if [ -d "$HOME/.forgen" ] && [ "$(ls -A "$HOME/.forgen" 2>/dev/null)" ]; then
  warn "~/.forgen already populated (non-clean)"
else
  pass "clean ~/.forgen (첫 사용자 경험 시뮬 조건)"
fi

# 프로젝트 초기화
cd /workspace/test-project
mkdir -p src tests

# ── 라운드 1: 간단 구현 + 테스트 (TDD 키워드) ──
echo ""
echo "  [Round 1: 간단 함수 구현 + TDD]"
R1=$(claude -p "TDD 로 src/isPrime.ts 에 isPrime(n:number):boolean 함수 구현. 먼저 tests/isPrime.test.ts 작성 후 구현. 완료되면 '테스트 통과' 라고만 답해." \
  --allowedTools "Bash,Write,Read,Edit" 2>&1 || echo "R1_ERR")
echo "$R1" | tail -20

# 검증: 파일 생성 + tdd 스킬 주입 흔적 + 완료 선언 block 여부
if [ -f src/isPrime.ts ] && [ -f tests/isPrime.test.ts ]; then
  pass "R1: tests + 구현 파일 모두 생성"
else
  fail "R1: 파일 생성 불완전"
fi

# forgen state 점검
echo ""
echo "  [R1 학습 산출물]"
[ -d "$HOME/.forgen/me" ] && pass "~/.forgen/me 생성됨" || warn "~/.forgen/me 아직 없음"
[ -f "$HOME/.forgen/state/implicit-feedback.jsonl" ] \
  && IF_CNT=$(wc -l < "$HOME/.forgen/state/implicit-feedback.jsonl") \
  && pass "implicit-feedback.jsonl entries: $IF_CNT" \
  || warn "implicit-feedback.jsonl not yet"

# ── 라운드 2: 회귀 유발 시도 (drift/revert) ──
echo ""
echo "  [Round 2: 같은 파일 반복 수정 (drift 유도)]"
R2=$(claude -p "src/isPrime.ts 의 isPrime 함수를 5번 서로 다른 방식으로 다시 구현해봐. (loop / recursion / math.sqrt / regex / bit) 각 구현 사이마다 파일 전체 교체." \
  --allowedTools "Write,Edit,Read" 2>&1 || echo "R2_ERR")
echo "$R2" | tail -10
# drift/revert signal 확인
if [ -f "$HOME/.forgen/state/implicit-feedback.jsonl" ]; then
  DRIFT=$(grep -c 'drift_critical\|drift_warning\|repeated_edit' "$HOME/.forgen/state/implicit-feedback.jsonl" 2>/dev/null || echo 0)
  if [ "$DRIFT" -gt 0 ]; then
    pass "R2: drift/repeated_edit signal emitted ($DRIFT events)"
  else
    warn "R2: drift 없음 (5회 재구현이 충분치 않았거나 hook miss)"
  fi
fi

# ── 라운드 3: 명시적 교정 (correction-record 경로) ──
echo ""
echo "  [Round 3: 사용자 교정 — 앞으로 이렇게 해줘]"
R3=$(claude -p "앞으로 모든 TypeScript 함수 주석은 한국어로 작성해줘. 이걸 기억해." \
  --allowedTools "Read" 2>&1 || echo "R3_ERR")
echo "$R3" | tail -10

# correction-record MCP 호출 흔적 — evidence 저장됐나
CORRECT_CNT=$(find "$HOME/.forgen/me/behavior" -name "*.json" 2>/dev/null | xargs grep -l "explicit_correction\|korean\|한국어" 2>/dev/null | wc -l | tr -d ' ')
if [ "$CORRECT_CNT" -gt 0 ]; then
  pass "R3: correction evidence stored ($CORRECT_CNT behavior files)"
else
  warn "R3: correction evidence not captured (MCP tool 호출 안 했거나 저장 실패)"
fi

# ── 최종 학습 집계 ──
echo ""
echo "  [세션 종료 시 학습 결과]"

ME=$HOME/.forgen/me
STATE=$HOME/.forgen/state

RULES=$(ls $ME/rules 2>/dev/null | wc -l | tr -d ' ')
SOLUTIONS=$(ls $ME/solutions 2>/dev/null | wc -l | tr -d ' ')
BEHAVIOR=$(ls $ME/behavior 2>/dev/null | wc -l | tr -d ' ')
RECOMMENDATIONS=$(ls $ME/recommendations 2>/dev/null | wc -l | tr -d ' ')

echo "    rules: $RULES / solutions: $SOLUTIONS / behavior: $BEHAVIOR / recommendations: $RECOMMENDATIONS"

if [ "$BEHAVIOR" -gt 0 ] || [ "$RULES" -gt 0 ]; then
  pass "학습 흔적 있음 (behavior=$BEHAVIOR rules=$RULES)"
else
  fail "학습 흔적 없음 — auto-compound 가 아직 안 돌았거나 경로가 끊김"
fi

# forgen stats 결과
echo ""
echo "  [forgen stats 결과]"
forgen stats 2>&1 | head -30
echo ""
echo "  [hook-errors — 신 포맷 v0.4.1 검증]"
if [ -f "$STATE/hook-errors.jsonl" ]; then
  CNT=$(wc -l < "$STATE/hook-errors.jsonl")
  HAS_DETAIL=$(grep -c '"error"' "$STATE/hook-errors.jsonl" 2>/dev/null || echo 0)
  if [ "$CNT" -gt 0 ]; then
    echo "    hook-errors: $CNT entries, $HAS_DETAIL with detail (v0.4.1 형식)"
    if [ "$HAS_DETAIL" -gt 0 ]; then
      pass "hook-errors 신 포맷 적용됨"
    else
      warn "hook-errors 있지만 신 포맷 아님 (legacy)"
    fi
  else
    pass "hook-errors 0 (hook 안정적)"
  fi
else
  pass "hook-errors.jsonl 없음 (hook 안정적)"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Buyer Day-1 결과: $PASS passed, $FAIL failed, $WARN warnings"
echo "═══════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
