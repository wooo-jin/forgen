# assets/ — 자산 분리 매핑 (§7.2)

> 출처: `docs/superpowers/specs/2026-04-27-forgen-multi-host-core-design.md` §7.2  
> 상태: 1차 매핑 문서 박제 (실 이동 미완료)  
> 작성일: 2026-04-27

---

## 목표 디렉토리 구조

```
assets/
  claude/     Claude 전용 자산 (manifest, agents, commands, hooks 등록 manifest)
  codex/      Codex 전용 자산 (hooks.json 머지 템플릿, config 스니펫 등)
  shared/     호스트 무관 공통 자산 (hook 스크립트 본체, 이미지 등)
```

현재 `assets/` 루트에 있는 이미지/SVG/데모 파일은 **공통 자산**으로, 향후 `assets/shared/`로 이동합니다.

---

## 자산 매핑 표

| 현재 위치 | 목표 위치 | 이동 단계 | 비고 |
|---|---|---|---|
| `agents/*.md` | `assets/claude/agents/` | **2차 PR** | Claude Code 전용 서브에이전트 정의. Codex는 `AGENTS.md` 모델이므로 codex/ 동치 미정 |
| `commands/*.md` | `assets/claude/commands/` | **2차 PR** | Claude Code slash-command 원본. skills/ 생성의 소스 역할 |
| `skills/{name}/SKILL.md` | `assets/claude/skills/` | **2차 PR** | copy-assets.js 가 commands/ 를 변환하여 생성. Claude Code plugin 표준 |
| `hooks/hooks.json` | `assets/claude/hooks/hooks.json` + `assets/codex/hooks.json` | **2차 PR** | hooks.json schema 가 Claude/Codex 동일 (§18.4 확인). Codex 등록 시 절대경로 pre-expand 필요 (§18.5) |
| `hooks/hook-registry.json` | `assets/shared/hook-registry.json` | **2차 PR** | 호스트 무관 메타데이터. 양쪽 어댑터가 동일 registry 참조 |
| `assets/banner.png` | `assets/shared/banner.png` | **2차 PR** | 호스트 무관 이미지 자산 |
| `assets/banner.svg` | `assets/shared/banner.svg` | **2차 PR** | 동상 |
| `assets/architecture.svg` | `assets/shared/architecture.svg` | **2차 PR** | 동상 |
| `assets/icon.png` | `assets/shared/icon.png` | **2차 PR** | 동상 |
| `assets/demo-preview.svg` | `assets/shared/demo-preview.svg` | **2차 PR** | 동상 |
| `assets/demo/*` | `assets/shared/demo/` | **2차 PR** | 동상 |
| `dist/hooks/*.js` (빌드 산출물) | 이동 없음 — InstallPlan에서 절대경로 inject | **해당 없음** | hook 스크립트 본체는 host 무관 node 스크립트. Claude/Codex 양쪽이 동일 경로를 가리킴 (§14.2) |

### Claude 전용 자산 (`assets/claude/`)

- Claude Code plugin manifest (`plugin.json`)
- `agents/*.md` — Claude Code 서브에이전트 정의
- `commands/*.md` — slash-command 원본
- `skills/` — Claude Code plugin 표준 (commands 에서 자동 생성)
- `hooks/hooks.json` — `${CLAUDE_PLUGIN_ROOT}` 환경변수 참조 버전 (Claude 전용)

### Codex 전용 자산 (`assets/codex/`)

- `hooks.json` — 절대경로 pre-expand 버전. `~/.codex/hooks.json` 에 머지할 템플릿
- `config-snippet.toml` — `~/.codex/config.toml` 의 `[mcp_servers]` 등록 스니펫
- (Phase 2) Codex `AGENTS.md` 템플릿 — `skills/commands/agents` 의 Codex 등치 (미확정)

### 공통 자산 (`assets/shared/`)

- `hook-registry.json` — 호스트 무관 hook 메타데이터 레지스트리
- `dist/hooks/*.js` — 런타임에 절대경로로 inject (실제 파일 이동 없음)
- 이미지/SVG/데모 파일 일체

---

## 마이그레이션 단계

### 1차 PR (현재 — 이동 없음)
- [x] 이 README 박제 — 매핑 의도 문서화
- [x] `agents/`, `commands/`, `skills/`, `hooks/` 에 이동 예정 주석 추가
- [ ] `scripts/copy-assets.js` 에 TODO 주석 추가 (다음 작업)

### 2차 PR (실 이동)
- `agents/`, `commands/`, `skills/` → `assets/claude/`
- `hooks/hooks.json` → `assets/claude/hooks/hooks.json` (Claude 버전)
- `hooks/hook-registry.json` → `assets/shared/hook-registry.json`
- 이미지/SVG/데모 → `assets/shared/`
- Codex hooks 템플릿 → `assets/codex/hooks.json`

### 3차 PR (어댑터 연동)
- `scripts/copy-assets.js` 의 소스 경로를 새 구조로 갱신
- Claude InstallPlan: `assets/claude/` → `~/.claude/plugins/cache/...`
- Codex InstallPlan: `assets/codex/hooks.json` → 절대경로 pre-expand → `~/.codex/hooks.json` 머지

---

## 호환성 메모

- **hooks.json schema 동일성 (§18.4)**: forgen의 현재 `hooks/hooks.json` 형식이 Codex `~/.codex/hooks.json` schema와 완전 동일. 단, `${CLAUDE_PLUGIN_ROOT}` 환경변수는 Codex에서 자동 주입되지 않으므로 절대경로 pre-expand 필수 (§18.5).
- **agents/commands/skills Codex 동치 미정**: Codex의 prompt 자산 모델은 `AGENTS.md` / `requirements.toml` 중심으로 forgen `skills/commands/agents` 의 직접 대응 표면이 없음. Phase 2 InstallPlan에서 결정.
- **실 패키지 분리는 3단계 이후**: 현재는 단일 패키지 유지. 구조만 분리 가능한 상태로 준비 (§7.3).
