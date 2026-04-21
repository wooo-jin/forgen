#!/bin/bash
# forgen Step 0 — Docker live e2e 3축 invariant 검증 실행 스크립트
#
# Dockerfile.v3-live + verify-live-claude.sh (Phase 8-11 추가 포함)
# 사용 방법:
#   ./tests/e2e/docker/run-step0-invariants.sh            # 전체 (Claude 인증 마운트)
#   SKIP_CLAUDE=1 ./run-step0-invariants.sh              # Phase 1-7 skip, invariant(8-11)만
#
# 환경변수:
#   SKIP_CLAUDE=1 — Claude API 호출 건너뛰고 invariant만 실행

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
IMAGE="forgen-step0-invariants:latest"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CLAUDE_CRED="${CLAUDE_CRED:-$HOME/.claude.json}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  forgen Step 0 — Core Feedback Loop Invariants (Docker)"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd "$PROJECT_ROOT"

echo ">>> Step 1: Docker image build (Dockerfile.v3-live)"
docker build -t "$IMAGE" -f "$SCRIPT_DIR/Dockerfile.v3-live" "$PROJECT_ROOT" 2>&1 | tail -15
echo ""

# Claude 인증 마운트 여부 결정
MOUNT_ARGS=()
if [ "${SKIP_CLAUDE:-0}" = "1" ]; then
  echo ">>> Mode: SKIP_CLAUDE — Phase 1-7 will early-exit, Phase 8-11 run"
elif [ -f "$CLAUDE_CRED" ]; then
  MOUNT_ARGS=(-v "$CLAUDE_CRED:/home/tester/.claude.json:ro")
  if [ -d "$CLAUDE_HOME" ]; then
    MOUNT_ARGS+=(-v "$CLAUDE_HOME:/home/tester/.claude:ro")
  fi
  echo ">>> Mode: FULL — Claude auth mounted from $CLAUDE_CRED"
else
  echo ">>> Mode: NO-AUTH — $CLAUDE_CRED missing, Phase 1-7 will fail but Phase 8-11 should still run"
fi
echo ""

echo ">>> Step 2: Run Docker container"
echo ""
set +e
docker run --rm "${MOUNT_ARGS[@]}" "$IMAGE"
EXIT_CODE=$?
set -e

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "  ✅ Step 0 — ALL INVARIANTS VERIFIED IN DOCKER"
else
  echo "  ⚠  Exit code $EXIT_CODE — check Phase 8-11 section above"
fi

exit $EXIT_CODE
