// TODO(§7.2 자산분리 2차 PR): 소스 경로 갱신 예정
//   commands/  → assets/claude/commands/
//   skills/    → assets/claude/skills/
//   hooks/hooks.json → assets/claude/hooks/hooks.json (Claude 버전)
//                    + assets/codex/hooks.json (절대경로 pre-expand 버전)
//   hook-registry.json → assets/shared/hook-registry.json
// 자세한 매핑은 assets/README.md 참고.

import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

// 1. dangerous-patterns.json 복사
const src = new URL('../src/hooks/dangerous-patterns.json', import.meta.url).pathname;
const dst = new URL('../dist/hooks/dangerous-patterns.json', import.meta.url).pathname;
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst);
console.log('[build] Copied dangerous-patterns.json');

// 2. commands/*.md → skills/{name}/SKILL.md 생성 (Claude Code 플러그인 표준)
const commandsDir = join(PKG_ROOT, 'commands');
const skillsDir = join(PKG_ROOT, 'skills');
if (existsSync(commandsDir)) {
  try { rmSync(skillsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const name = file.replace('.md', '');
    const raw = readFileSync(join(commandsDir, file), 'utf-8');
    const descMatch = raw.match(/description:\s*(.+)/);
    const desc = descMatch?.[1]?.trim() ?? name;
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch?.[1]?.trim() ?? raw;
    const skillDir = join(skillsDir, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`);
  }
  console.log(`[build] Generated ${files.length} skills from commands/`);
}
