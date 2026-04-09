#!/bin/bash
# forgen v1 Docker E2E 테스트 실행
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "[forgen] Building v1 E2E test image..."
docker build -t forgen-v1-test -f "$SCRIPT_DIR/Dockerfile.v1" "$PROJECT_ROOT"

echo ""
echo "[forgen] Running v1 E2E verification..."
docker run --rm forgen-v1-test
