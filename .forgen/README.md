# forgen self-dogfood — L1 Hard Rules

이 디렉토리는 ADR-003 Phase 1 "자기 적용" — forgen 저장소에서 Claude Code 를 쓸 때 forgen 자신의 L1 규칙이 실제 hook 으로 발화하도록 하는 committed 설정.

## L1 규칙 (hard, 승급 불가)

| Rule ID | 정책 | Mech | Hook |
|---------|------|------|------|
| `L1-e2e-before-done` | Docker e2e 증거 없이 완료 선언 금지 | A | Stop |
| `L1-no-mock-as-proof` | mock/stub/fake 기반 검증 완료 선언 금지 | B | Stop |
| `L1-no-rm-rf-unconfirmed` | 사용자 confirm 없는 rm -rf 금지 | A | PreToolUse |
| `L1-no-secret-commit` | API key 패턴 커밋/푸시 금지 | A | PostToolUse |

## 활성화 (로컬 개발자)

프로젝트별 rules 는 아직 자동 로드되지 않습니다 (v0.4.1 예정). 수동 opt-in:

```bash
# 이 디렉토리의 rules 를 ~/.forgen/me/rules/ 로 복사
mkdir -p ~/.forgen/me/rules
cp .forgen/rules/*.json ~/.forgen/me/rules/

# 검증: forgen classify-enforce 가 enforce_via 이미 있는 것을 인지
node dist/cli.js classify-enforce
```

복사 후 Claude Code 에서 forgen hook 이 이 L1 규칙을 실제로 발화합니다. 개발 중 자신의 규칙에 막히는 경험 = ADR-003 미션 달성의 일차 증거.

## 검증 (self-gate)

```bash
node scripts/self-gate.cjs           # 정적
node scripts/self-gate-runtime.cjs   # hook smoke 6 시나리오
```

CI 는 `.github/workflows/self-gate.yml` 이 push/PR 마다 자동 실행.
