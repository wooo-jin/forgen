# Spike: claude-mem 도입 검토 (US-000)

**Date**: 2026-04-28
**Status**: Complete
**Linked PRD**: `docs/plans/2026-04-28-forgen-testbed-proof-spec.md`
**Linked ADRs**: ADR-004 (orchestration), ADR-005 (eval module)
**Spike location**: `/tmp/forgen-claude-mem-spike/` (isolated, 본 repo 영향 0)

## 목적

ADR-004/005 작성 시 claude-mem 실 인터페이스 미검증 상태였음 (Round 11 [review] 발견). 실측 후 amendment 필요 여부 판단.

## Acceptance Criteria 검증

| AC | 결과 | 증거 |
|---|---|---|
| AC1 npm 패키지 + 최신 버전 | ✓ | `claude-mem@12.4.8`, AGPL-3.0, 142 versions |
| AC2 hook 등록 방식 | ✓ | **Plugin 모델** — `npx claude-mem install --ide claude-code` |
| AC3 hook 입출력 schema | ✓ | `plugin/hooks/hooks.json` — Setup/SessionStart/UserPromptSubmit/PostToolUse |
| AC4 저장 형식 | ✓ | worker service (Bun 필요) + observation DB + Web viewer @ :37777 |
| AC5 API/CLI 표면 | ✓ | install / search / start / stop / status / transcript watch / adopt |
| AC6 보고서 작성 | ✓ | 이 문서 |
| AC7 ADR amendment 필요 | ✓ | **YES** — ADR-004 대규모, ADR-005 부분 |

## 실측 데이터

### Package Identity
```
name: claude-mem@12.4.8
license: AGPL-3.0  ★ forgen MIT와 호환성 검토 필수
unpackedSize: 120.6 MB
deps: 14 (런타임) + 21+ tree-sitter parsers (plugin level)
runtime: Node ≥18 + Bun ≥1.0 (worker service에 필수)
```

### Architecture — Plugin Model (★ 가장 중요한 발견)

claude-mem은 npm package지만 *Claude Code plugin*으로 동작:

```
사용자 install 흐름:
  npx claude-mem install --ide claude-code
    ↓
  ~/.claude/plugins/cache/thedotmack/claude-mem/<version>/  에 설치
    ↓
  Claude Code가 plugin manifest 자동 인식
    ↓
  hooks.json에 정의된 hook을 Claude Code가 자체 chain
```

**즉 forgen이 claude-mem을 npm `require()`로 import하지 않음.** 둘 다 *별도 plugin*으로 공존.

### Hook 등록 (실측)

```json
// plugin/hooks/hooks.json (요약)
{
  "Setup": [{"matcher": "*", "command": "smart-install.js"}],
  "SessionStart": [
    {"matcher": "startup|clear|compact", "command": "smart-install + worker start + claude-code context"}
  ],
  "UserPromptSubmit": [{"command": "worker hook claude-code session-init"}],
  "PostToolUse": [...]
}
```

**모든 hook이 plugin/scripts/bun-runner.js → worker-service.cjs 호출.** Bun runtime 의존.

### CLI Surface

```
Install:    npx claude-mem install [--ide <id>]
Runtime:    npx claude-mem {start|stop|restart|status|search|transcript watch}
Cleanup:    npx claude-mem cleanup
SDK:        import { ... } from 'claude-mem/sdk'  (programmatic)
```

testbed `claude-mem-only` arm 구현 시 사용:
- `npx claude-mem search <query>` — observation 검색 ★ recall 측정
- `npx claude-mem start/stop` — arm setup/teardown

### IDE Support 범위
```
claude-code, cursor, gemini-cli, opencode, openclaw,
windsurf, codex-cli, copilot-cli, antigravity, goose,
crush, roo-code, warp
```
forgen이 codex 지원 추가한 것과 정합 — 같은 IDE 시장 타겟.

### 기능 표면

- Persistent memory (observation DB)
- Progressive disclosure (token cost 가시화)
- MCP search tools
- Web viewer UI (localhost:37777)
- `<private>` tag로 sensitive 콘텐츠 제외
- Citation system (observation ID 참조)
- "Endless Mode" beta

## 가설 vs 실측 — 회고

| ADR-004 가설 | 실측 | 결과 |
|---|---|---|
| forgen이 claude-mem hook을 chain orchestrate | Claude Code plugin model이 자동 chain — forgen 개입 불필요 | **가설 폐기** |
| settings.json auto-sort 스크립트 작성 | plugin install 자체가 자동 등록 — settings.json 수동 수정 불필요 | **가설 폐기** |
| Read-only consumer 계약 (claude-mem additionalContext 읽기) | Plugin chain에서 두 inject가 *concatenated* — 분리하려면 별도 표식 필요 | **부분 유효** |
| Fallback detection | npm 미감지 + plugin 미감지 두 단계로 정밀화 | **확장 필요** |

| ADR-005 가설 | 실측 | 결과 |
|---|---|---|
| claude-mem npm devDep으로 pin | OK, AGPL 영향 dev only | **유효** (단 dist 영향 검토) |
| `claude-mem-only` arm = npm package import | 실은 CLI invoke (`npx claude-mem search`) | **수정 필요** |
| dataset/loader가 claude-mem 입력 형태 정합 | claude-mem은 transcript watcher가 자동 capture — 별도 입력 형태 없음 | **수정 필요** |

| ADR-006 (메트릭) | — | **영향 없음** |

## ADR Amendment 권장

### ADR-004 — 대규모 재작성
**기존 Option E (orchestration)를 폐기**. 새 채택:
- 사용자가 forgen + claude-mem 둘 다 *별도 plugin install* (forgen 본체 변경 0)
- forgen README에 "권장: `npx claude-mem install`" 안내만
- Coexistence 검증 = forgen Hook과 claude-mem Hook 동시 실행 시 결정성 측정 (testbed에서 검증)
- forgen이 claude-mem inject 결과를 *읽을* 필요는 사실상 없음 — 둘 다 Claude의 컨텍스트에 추가만 하면 모델이 활용

### ADR-005 — 부분 amendment
- `claude-mem-only` arm 구현: CLI invoke (`npx claude-mem ...`) via child_process. Module import 아님.
- testbed runner는 claude-mem worker service의 lifecycle 관리 (start before run, stop after).
- 이전 "version pin" 정책 유지하되 *npm devDep* 형태 (forgen 본체 dist에는 안 들어감 — AGPL 영향 0).

### ADR-006 — 영향 없음

## License Analysis (CRITICAL → 검토 후 LOW)

### AGPL-3.0 vs MIT 결합 시나리오

| 시나리오 | AGPL 적용 | 판정 |
|---|---|---|
| forgen이 claude-mem을 `require()` import → 결합 저작물 | YES — forgen 전체에 AGPL 강제 | ❌ 회피 |
| forgen npm package에 claude-mem dependency | 위와 동일, 결합으로 해석 가능 | ❌ 회피 |
| forgen-eval (별도 module)이 claude-mem CLI invoke (devDep) | 별도 프로세스, 결합 아님 | ✓ OK |
| 사용자가 forgen + claude-mem 둘 다 plugin install | 별도 plugin 공존 | ✓ OK |

**결론**: forgen 본체에는 claude-mem 의존성 *절대 추가 안 함*. forgen-eval에서만 devDep 또는 child_process invoke. (α) "minimal default + Full 권장" 정책이 *AGPL 회피와 우연히 정합*.

## 위험 발견 (신규)

### Risk: Bun runtime 의존
- claude-mem worker가 Bun ≥1.0 요구. forgen은 Node only.
- testbed에서 claude-mem arm 구동 시 Bun 설치 전제 — *PUBLIC track 재현성 영향*.
- 완화: spike 결과로 PUBLIC track README에 "Bun install 가이드" 추가.

### Risk: claude-mem worker 활성 상태가 forgen 동작에 간섭
- worker가 transcript watcher를 가동 — Claude Code session 전체를 capture.
- forgen이 자체 hook으로 transcript 후처리할 때 race condition 가능.
- 완화: testbed에서 forgen-only arm은 claude-mem 완전 uninstall (plugin) 상태 검증.

### Risk: `forgen-plus-mem` arm의 ψ 측정 신뢰도
- 두 plugin이 컨텍스트에 inject할 때 *concatenation* 방식 — 누가 어느 부분 inject했는지 분리 어려움.
- 완화: ψ는 *최종 출력의 종합 점수* 비교로만 측정 (inject 분리 측정은 v0.6+).

## 변경된 PRD 영향

기존 forge-loop PRD (23 stories) 중:
- **US-015 [DESTRUCTIVE] hook orchestration 자동화** → **삭제 또는 단순화** (plugin 모델로 불필요)
- **US-016 [DESTRUCTIVE] claude-mem 본 repo 의존성 추가** → **삭제** (AGPL 회피)
- **US-008 arms 5종** → claude-mem-only arm 정의 *수정* (CLI invoke 모델)
- **US-007 datasets/loader** → claude-mem 입력 형태 의존 *제거* (transcript watcher 자동 capture)
- **신규 US-X**: testbed runner의 worker lifecycle 관리 (start/stop)

## US-000 결론

**SPIKE PASS** — claude-mem 실측 완료, ADR amendment 항목 식별, AGPL 회피 경로 확정, PRD 5항목 변경 명세화.

다음 단계: US-000.1 (ADR-004 amendment) + US-000.2 (ADR-005 amendment) 진행 전 사용자 확인 필요 — *대규모 변경*이므로.
