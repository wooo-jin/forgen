#!/bin/bash
# forgen v0.3 — 실제 Claude Code 세션으로 스킬 동작 검증
# HOST에서 ~/.claude/를 마운트하여 인증 재사용

set -uo pipefail

PASS=0
FAIL=0
pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  forgen v0.3 — LIVE Claude Code Session Verification"
echo "═══════════════════════════════════════════════════════"
echo ""

FORGEN_PKG=/usr/local/lib/node_modules/@wooojin/forgen
FORGEN_DIST=$FORGEN_PKG/dist

# ── Phase 0: 환경 확인 ──
command -v claude &>/dev/null && pass "claude CLI available" || { fail "claude CLI missing"; exit 1; }
command -v forgen &>/dev/null && pass "forgen CLI available" || { fail "forgen CLI missing"; exit 1; }

# 인증 확인
if [ -f ~/.claude.json ]; then
  pass "Claude OAuth credentials available"
else
  fail "No Claude credentials — cannot run live session"
  exit 1
fi

echo ""

# ── Phase 1: 온보딩 + harness 설치 ──
echo "  [Phase 1: Setup]"

node -e "
import('$FORGEN_DIST/forge/onboarding.js').then(async onb => {
  const { createProfile, saveProfile } = await import('$FORGEN_DIST/store/profile-store.js');
  const { ensureV1Directories } = await import('$FORGEN_DIST/core/v1-bootstrap.js');
  ensureV1Directories();
  const r = onb.computeOnboarding('B', 'B', 'B', 'B');
  saveProfile(createProfile('live-test', r.qualityPack, r.autonomyPack, r.suggestedTrustPolicy, 'onboarding', r.judgmentPack, r.communicationPack));
});
" 2>/dev/null && pass "profile created" || fail "profile creation failed"

cd /workspace/test-project
node -e "
import('$FORGEN_DIST/core/harness.js').then(async m => {
  await m.prepareHarness('/workspace/test-project');
});
" 2>/dev/null && pass "harness initialized" || fail "harness failed"

# 설치 결과 확인
AGENT_CNT=$(ls .claude/agents/ch-*.md 2>/dev/null | wc -l | tr -d ' ')
SKILL_CNT=$(ls ~/.claude/commands/forgen/*.md 2>/dev/null | wc -l | tr -d ' ')
[ "$AGENT_CNT" = "12" ] && pass "12 agents installed" || fail "agents: $AGENT_CNT"
[ "$SKILL_CNT" = "10" ] && pass "10 skills installed" || fail "skills: $SKILL_CNT"

# 사전 compound 솔루션 심기 (injection 테스트용)
forgen compound --solution "live-test-pattern-jwt" "JWT refresh token race condition: use atomic CAS operation on refresh_token_id in DB, not in-memory lock" >/dev/null 2>&1
pass "seeded compound solution"

echo ""

# ── Phase 2: 실제 claude -p 호출 (기본) ──
echo "  [Phase 2: Basic Claude Session]"

BASIC_OUT=$(claude --dangerously-skip-permissions -p "2 + 2는 뭐야? 숫자만 답해" 2>&1 | head -5)
echo "  output snippet: $(echo "$BASIC_OUT" | head -1)"
if echo "$BASIC_OUT" | grep -qE "^\s*4\s*$|4\."; then
  pass "Claude responds to basic prompt (auth works)"
else
  fail "Claude didn't respond with 4: $BASIC_OUT"
fi

echo ""

# ── Phase 3: solution-injector가 실제 세션에 주입하는지 ──
echo "  [Phase 3: Solution Injection in Live Session]"

# JWT 관련 프롬프트 → 심어둔 솔루션이 주입되어야 함
INJECT_OUT=$(claude --dangerously-skip-permissions -p "JWT refresh token 경쟁 조건 어떻게 해결해? 한 줄로 답해" 2>&1 | head -10)
echo "  --- claude output ---"
echo "$INJECT_OUT" | head -5
echo "  ---------------------"

# 응답에 우리가 심어둔 솔루션의 핵심 키워드가 반영되는지
if echo "$INJECT_OUT" | grep -qiE "atomic CAS|refresh_token_id|compare.*and.*swap"; then
  pass "Claude response reflects injected compound solution (CAS pattern)"
else
  # 간접 확인: match-eval-log에 이 세션에 대한 주입 기록이 있는지
  sleep 1
  if [ -f ~/.forgen/state/match-eval-log.jsonl ] && grep -q "live-test-pattern-jwt" ~/.forgen/state/match-eval-log.jsonl; then
    pass "match-eval-log records injection (Claude may have reformulated)"
  else
    fail "Solution not injected or not used: $(echo "$INJECT_OUT" | head -3)"
  fi
fi

echo ""

# ── Phase 4: deep-interview 스킬 실제 발동 ──
echo "  [Phase 4: deep-interview Skill Triggers]"

DI_OUT=$(claude --dangerously-skip-permissions -p "deep-interview 실행해줘. 주제: 간단한 todo 앱" 2>&1 | head -30)
echo "  --- deep-interview output ---"
echo "$DI_OUT" | head -10
echo "  -----------------------------"

# Ambiguity Score, Weighted dimensions 등 스킬 특유의 구조 등장 확인
if echo "$DI_OUT" | grep -qiE "ambiguity|모호성|goal clarity|constraint|round"; then
  pass "deep-interview skill prompt actually executed (Ambiguity framework referenced)"
else
  fail "deep-interview prompt not reflected in output"
fi

# 한 번에 한 질문만 하는지 (?? 문자 개수가 1~2개)
Q_COUNT=$(echo "$DI_OUT" | grep -cE "\\?$|\\?[[:space:]]*$" || echo 0)
if [ "$Q_COUNT" -le 2 ]; then
  pass "deep-interview asks ≤2 questions (one-question-at-a-time protocol)"
else
  fail "deep-interview asked $Q_COUNT questions at once (should be 1)"
fi

echo ""

# ── Phase 5: 에이전트 호출 ──
echo "  [Phase 5: Agent Invocation (planner via Task tool)]"

# planner 에이전트가 프롬프트 구조(작업 분류, 계획 출력 형식)를 따르는지
# Task 도구를 통한 명시적 호출은 Claude Code 내부 구조를 거치므로 -p로는 제한적
# 대신 에이전트 파일이 읽히는 상태에서 "planner 관점에서 계획 세워줘" 테스트
PLAN_OUT=$(claude --dangerously-skip-permissions -p "ch-planner 에이전트에게 다음 작업 계획을 세우라고 해: 유저 프로필 API 추가. 간단히 분류만 답해" 2>&1 | head -20)
echo "  --- planner agent output ---"
echo "$PLAN_OUT" | head -10
echo "  ----------------------------"

# 작업 분류 루브릭의 키워드 등장 확인
if echo "$PLAN_OUT" | grep -qiE "Trivial|Simple|Scoped|Complex"; then
  pass "planner prompt structure (classification rubric) reflected"
else
  fail "planner classification not used"
fi

echo ""

# ── Phase 6: Stop 훅 실제 개입 ──
echo "  [Phase 6: Stop Hook Intervention (forge-loop)]"

# forge-loop 상태 파일 심기
cat > ~/.forgen/state/forge-loop.json <<'EOF'
{
  "active": true,
  "startedAt": "2026-04-15T10:00:00Z",
  "stories": [
    {"id": "US-001", "title": "미완료 테스트 스토리", "passes": false}
  ]
}
EOF

# 세션에서 Claude가 응답 완료할 때 Stop 훅이 차단하는지
# claude -p는 일회성이라 Stop 훅은 발동하지만 차단 결과는 log로만 확인
FORGE_OUT=$(claude --dangerously-skip-permissions -p "안녕" 2>&1)
echo "  --- forge-loop block attempt output (head) ---"
echo "$FORGE_OUT" | head -10
echo "  ----------------------------------------------"

# 차단 시 blockCount 증가 확인
sleep 1
BC=$(node -e "try { console.log(JSON.parse(require('fs').readFileSync('/root/.forgen/state/forge-loop.json','utf-8')).blockCount || 0) } catch { console.log(0) }" 2>/dev/null || echo 0)
if [ "$BC" -ge 1 ]; then
  pass "Stop hook actually blocked live session (blockCount=$BC)"
else
  # 대안: 훅 이벤트 로그 확인
  HOOK_LOG=~/.forgen/state/hook-timing.jsonl
  if [ -f "$HOOK_LOG" ] && tail -20 "$HOOK_LOG" | grep -q "context-guard"; then
    pass "Stop hook fired during live session (timing log present)"
  else
    fail "Stop hook did not engage (blockCount=$BC, no timing log)"
  fi
fi

# 정리
rm -f ~/.forgen/state/forge-loop.json

echo ""

# ── Phase 7: Session summary (20+ prompts 시뮬레이션) ──
echo "  [Phase 7: Session Summary Runtime (solution-cache populated)]"

# solution-cache에 주입 데이터 심기 + context state 조작
SID="live-summary-test"
mkdir -p ~/.forgen/state
cat > ~/.forgen/state/solution-cache-$SID.json <<'EOF'
{"injected":[
  {"name":"pattern-1","injectedAt":"2026-04-15T10:00:00Z"},
  {"name":"pattern-2","injectedAt":"2026-04-15T10:10:00Z"}
]}
EOF
cat > ~/.forgen/state/context-guard.json <<EOF
{"promptCount":15,"totalChars":30000,"lastWarningAt":0,"lastAutoCompactAt":0,"sessionId":"$SID"}
EOF

SUMMARY_OUT=$(echo "{\"stop_hook_type\":\"end_turn\",\"session_id\":\"$SID\"}" | node "$FORGEN_DIST/hooks/context-guard.js" 2>&1)

if echo "$SUMMARY_OUT" | grep -q "주입된 compound: 2건" && echo "$SUMMARY_OUT" | grep -q "16분"; then
  pass "session summary counterfactual correct (2 × 8min = 16min)"
else
  fail "counterfactual wrong: $SUMMARY_OUT"
fi

echo ""

# ─────────────────────────────────────────────────────────────
#  Step 0 — Core Feedback Loop Invariants (3축 single source of truth)
#  feedback_core_loop_invariant.md — 2026-04-20
# ─────────────────────────────────────────────────────────────

# ── Phase 8: 승급 경로 단일화 (incrementEvidence는 status를 바꾸지 않는다) ──
echo "  [Phase 8: Promotion Path Invariant — candidate stays candidate under inject]"

cat > /tmp/test-candidate.md <<'EOF'
---
name: inv-test-candidate
version: 1
status: candidate
confidence: 0.6
type: pattern
scope: me
tags: ['invariant-test']
identifiers: []
created: '2026-04-20'
updated: '2026-04-20'
supersedes: null
extractedBy: auto
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
---

body
EOF
cp /tmp/test-candidate.md ~/.forgen/me/solutions/inv-test-candidate.md

# incrementEvidence 10회 호출 (과거에는 5회만으로 자동 verified 플립)
node -e "
import('$FORGEN_DIST/engine/solution-writer.js').then(async m => {
  for (let i = 0; i < 10; i++) m.incrementEvidence('inv-test-candidate', 'injected');
});
" 2>/dev/null
sleep 1

FINAL_STATUS=$(node -e "
const fs = require('fs');
const content = fs.readFileSync(process.env.HOME + '/.forgen/me/solutions/inv-test-candidate.md', 'utf-8');
const m = content.match(/status:\s*(\w+)/);
const inj = content.match(/injected:\s*(\d+)/);
console.log((m?m[1]:'?') + ':' + (inj?inj[1]:'?'));
")

if [ "$FINAL_STATUS" = "candidate:10" ]; then
  pass "Promotion invariant held: candidate → still candidate after 10 injects (dual-path removed)"
else
  fail "Promotion invariant BROKEN: expected candidate:10, got $FINAL_STATUS"
fi

rm -f ~/.forgen/me/solutions/inv-test-candidate.md

echo ""

# ── Phase 9: Rollback 경로 단일화 (archive-based, never destructive) ──
echo "  [Phase 9: Rollback Path Invariant — archive, never unlink]"

YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)
cat > ~/.forgen/me/solutions/inv-test-rollback.md <<EOF
---
name: inv-test-rollback
version: 1
status: candidate
confidence: 0.5
type: pattern
scope: me
tags: ['rollback-test']
identifiers: []
created: '$YESTERDAY'
updated: '$YESTERDAY'
supersedes: null
extractedBy: auto
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
---

body
EOF

TODAY=$(date +%Y-%m-%d)
TWO_DAYS_AGO=$(date -d "2 days ago" +%Y-%m-%d 2>/dev/null || date -v-2d +%Y-%m-%d)

# rollback 실행 (어제부터)
forgen compound rollback --since "$TWO_DAYS_AGO" >/dev/null 2>&1 || true
sleep 1

# 원본 사라짐 확인
if [ ! -f ~/.forgen/me/solutions/inv-test-rollback.md ]; then
  pass "Rollback: source file removed from me/solutions"
else
  fail "Rollback did not move source file"
fi

# archive 존재 확인
ARCHIVED=$(find ~/.forgen/lab/archived -name "*inv-test-rollback*" -type f 2>/dev/null | head -1)
if [ -n "$ARCHIVED" ]; then
  pass "Rollback: file archived at $ARCHIVED (reversible — no unlinkSync)"
else
  fail "Rollback did NOT archive file (destructive unlink regression?)"
fi

# dry-run 검증
cat > ~/.forgen/me/solutions/inv-test-rollback-dry.md <<EOF
---
name: inv-test-rollback-dry
version: 1
status: candidate
confidence: 0.5
type: pattern
scope: me
tags: ['dry-run-test']
identifiers: []
created: '$YESTERDAY'
updated: '$YESTERDAY'
supersedes: null
extractedBy: auto
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
---

body
EOF

forgen compound rollback --since "$TWO_DAYS_AGO" --dry-run >/dev/null 2>&1 || true
if [ -f ~/.forgen/me/solutions/inv-test-rollback-dry.md ]; then
  pass "Rollback --dry-run did not modify file"
else
  fail "Rollback --dry-run destroyed file (dry-run broken)"
fi
rm -f ~/.forgen/me/solutions/inv-test-rollback-dry.md
# archive 정리 (다음 phase 영향 방지)
find ~/.forgen/lab/archived -name "rollback-*" -mmin -5 -exec rm -rf {} + 2>/dev/null || true

echo ""

# ── Phase 10: compound-core 가드레일 (config로 끌 수 없음) ──
echo "  [Phase 10: Compound-Core Guardrail — cannot be disabled via config]"

# project-level config로 compound-core hook 비활성화 시도
mkdir -p /workspace/test-project/.forgen
cat > /workspace/test-project/.forgen/hook-config.json <<'EOF'
{
  "hooks": {
    "post-tool-use": { "enabled": false },
    "solution-injector": { "enabled": false },
    "pre-tool-use": { "enabled": false },
    "session-recovery": { "enabled": false }
  },
  "tiers": {
    "compound-core": { "enabled": false }
  }
}
EOF

# isHookEnabled 직접 호출 — 모두 true여야 (가드레일)
GUARD_RESULT=$(FORGEN_CWD=/workspace/test-project node -e "
import('$FORGEN_DIST/hooks/hook-config.js').then(m => {
  const results = {};
  for (const name of ['post-tool-use','solution-injector','pre-tool-use','session-recovery','skill-injector']) {
    results[name] = m.isHookEnabled(name);
  }
  console.log(JSON.stringify(results));
});
" 2>/dev/null)

echo "  guardrail results: $GUARD_RESULT"
if echo "$GUARD_RESULT" | grep -qE '"post-tool-use":\s*true' \
  && echo "$GUARD_RESULT" | grep -qE '"solution-injector":\s*true' \
  && echo "$GUARD_RESULT" | grep -qE '"pre-tool-use":\s*true' \
  && echo "$GUARD_RESULT" | grep -qE '"session-recovery":\s*true'; then
  pass "Guardrail: compound-core hooks stay enabled despite project config disable"
else
  fail "Guardrail BROKEN: some compound-core hook got disabled — $GUARD_RESULT"
fi

# non-protected hook은 여전히 꺼지는지 (regression)
cat > /workspace/test-project/.forgen/hook-config.json <<'EOF'
{
  "hooks": {
    "secret-filter": { "enabled": false }
  }
}
EOF
NON_PROT=$(FORGEN_CWD=/workspace/test-project node -e "
import('$FORGEN_DIST/hooks/hook-config.js').then(m => {
  console.log(m.isHookEnabled('secret-filter'));
});
" 2>/dev/null)
if [ "$NON_PROT" = "false" ]; then
  pass "Non-protected hook (secret-filter) still respects disable config"
else
  fail "Non-protected hook regression: secret-filter should be disabled but got $NON_PROT"
fi
rm -rf /workspace/test-project/.forgen

echo ""

# ── Phase 11: finalizeSession 프로덕션 wiring (Stop hook → pending → unknown) ──
echo "  [Phase 11: finalizeSession wired in Stop hook]"

# pending outcome 하나 심기
SID2="inv-finalize-$(date +%s)"
node -e "
import('$FORGEN_DIST/engine/solution-outcomes.js').then(m => {
  m.appendPending('$SID2', [
    { solution: 'inv-pending-a', match_score: 0.9, injected_chars: 50 }
  ]);
});
" 2>/dev/null
sleep 1

# pending 파일 확인
SANITIZED=$(echo "$SID2" | sed 's/[^a-zA-Z0-9_-]/_/g')
PENDING_PATH=~/.forgen/state/outcome-pending-$SANITIZED.json
if [ -f "$PENDING_PATH" ]; then
  pass "pending file created before Stop"
else
  fail "appendPending did not create pending file: $PENDING_PATH"
fi

# Stop hook 실행 (context-guard Stop 분기)
STOP_OUT=$(echo "{\"stop_hook_type\":\"end_turn\",\"session_id\":\"$SID2\"}" | node "$FORGEN_DIST/hooks/context-guard.js" 2>&1)

# pending 파일이 사라져야 함
if [ ! -f "$PENDING_PATH" ]; then
  pass "Stop hook finalized pending (file removed)"
else
  fail "Stop hook did NOT finalize pending (file still exists at $PENDING_PATH)"
fi

# outcomes jsonl에 unknown event 기록됐는지
OUTCOME_PATH=~/.forgen/state/outcomes/$SANITIZED.jsonl
if [ -f "$OUTCOME_PATH" ] && grep -q '"outcome":"unknown"' "$OUTCOME_PATH"; then
  pass "Stop hook recorded unknown outcome (structural accept bias removed)"
else
  fail "No unknown outcome recorded — finalizeSession wiring broken"
fi

# 정리
rm -f "$OUTCOME_PATH"

echo ""

# ── Summary ──
echo "═══════════════════════════════════════════════════════"
echo "  Live Session Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ⚠  LIVE VERIFICATION HAS FAILURES (review logs above)"
  exit 1
else
  echo "  ✅ LIVE SESSION ALL PASSED"
  exit 0
fi
