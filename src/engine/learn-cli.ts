import * as path from 'node:path';
import * as os from 'node:os';
import { fixupSolutions } from './solution-fixup.js';
import { listQuarantined, pruneQuarantine } from './solution-quarantine.js';
import { computeFitness } from './solution-fitness.js';

const ME_SOLUTIONS = path.join(os.homedir(), '.forgen', 'me', 'solutions');

export async function handleLearn(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === 'fix-up') return runFixUp(args.slice(1));
  if (sub === 'quarantine') return runQuarantine(args.slice(1));
  if (sub === 'fitness') return runFitness(args.slice(1));
  printUsage();
}

function printUsage(): void {
  console.log(`
  forgen learn — solution index maintenance and fitness

  Usage:
    forgen learn fix-up [--apply]         Repair malformed solution frontmatter (dry-run by default)
    forgen learn quarantine [--prune]     Show files dropped by the index; --prune removes fixed/deleted
    forgen learn fitness [--json]         Show per-solution fitness (accept/correct/error ratios)
`);
}

function runFixUp(args: string[]): void {
  const apply = args.includes('--apply');
  const result = fixupSolutions(ME_SOLUTIONS, { dryRun: !apply });
  console.log(`\n  ${apply ? 'Applied' : 'Dry-run'}: scanned=${result.scanned} fixed=${result.fixed} untouched=${result.untouched} unfixable=${result.unfixable}`);
  for (const rep of result.reports) {
    const rel = path.basename(rep.path);
    if (rep.changed && rep.remaining_errors.length === 0) {
      console.log(`    ✓ ${rel} — add: ${rep.added.join(', ')}`);
    } else {
      console.log(`    ✗ ${rel} — remaining: ${rep.remaining_errors.join('; ')}`);
    }
  }
  if (!apply && result.fixed > 0) {
    console.log(`\n  Re-run with --apply to write changes.\n`);
  } else if (apply && result.fixed > 0) {
    console.log(`\n  Consider: forgen learn quarantine --prune\n`);
  } else {
    console.log('');
  }
}

function runQuarantine(args: string[]): void {
  if (args.includes('--prune')) {
    const result = pruneQuarantine();
    console.log(`\n  Pruned: removed=${result.removed} kept=${result.kept}\n`);
    return;
  }
  const entries = listQuarantined();
  if (entries.length === 0) {
    console.log(`\n  No quarantined solutions. ✓\n`);
    return;
  }
  console.log(`\n  Quarantined solutions (${entries.length}):\n`);
  for (const e of entries) {
    const rel = path.basename(e.path);
    console.log(`    ${rel} (${e.at})`);
    for (const err of e.errors) console.log(`      - ${err}`);
  }
  console.log(`\n  Fix: forgen learn fix-up --apply  → then: forgen learn quarantine --prune\n`);
}

function runFitness(args: string[]): void {
  const records = computeFitness();
  if (args.includes('--json')) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (records.length === 0) {
    console.log(`\n  No outcome events yet. Fitness becomes available after solution injections accumulate.\n`);
    return;
  }
  console.log(`\n  Solution Fitness (${records.length} tracked):\n`);
  console.log(`    ${'name'.padEnd(48)} ${'state'.padEnd(14)} ${'inj'.padStart(4)}  ${'acc/cor/err'.padStart(11)}  ${'fit'.padStart(6)}`);
  console.log(`    ${'-'.repeat(48)} ${'-'.repeat(14)} ${'-'.repeat(4)}  ${'-'.repeat(11)}  ${'-'.repeat(6)}`);
  for (const r of records) {
    const name = r.solution.length > 47 ? r.solution.slice(0, 45) + '..' : r.solution;
    const acr = `${r.accepted}/${r.corrected}/${r.errored}`;
    console.log(`    ${name.padEnd(48)} ${r.state.padEnd(14)} ${String(r.injected).padStart(4)}  ${acr.padStart(11)}  ${r.fitness.toFixed(2).padStart(6)}`);
  }
  console.log('');
}
