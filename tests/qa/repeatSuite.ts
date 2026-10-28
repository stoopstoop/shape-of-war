// Edge: repeat the whole vitest suite N times and report flakes. Not a test (vitest only collects
// *.test.ts). Run from the repo root:
//   node tests/qa/repeatSuite.ts [runs]            (default 10)
// Each run is `npx vitest run --reporter=json`, one after another (never in parallel with a build
// or with each other), default file order and worker count. Prints one line per run and then the
// flakes with file and line (a test that failed in some runs but not in all of them) and any test
// that failed in every run. Exits 1 on any failure. Needs Node 22.18 or newer (type stripping).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConsistentFailures, findFlakes, summariseRun } from './suiteRuns.ts';
import type { RunSummary } from './suiteRuns.ts';

const root = process.cwd();
const arg = Number(process.argv[2] ?? 10);
const runs = Number.isInteger(arg) && arg > 0 ? arg : 10;
const dir = mkdtempSync(join(tmpdir(), 'sow-repeat-'));
const summaries: RunSummary[] = [];

for (let i = 0; i < runs; i++) {
  const out = join(dir, `run-${i}.json`);
  const t0 = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  let summary: RunSummary | null = null;
  try {
    summary = summariseRun(JSON.parse(readFileSync(out, 'utf8')) as unknown, root);
  } catch {
    summary = null;
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  if (summary === null) {
    console.log(`run ${i + 1}: no report (exit ${r.status}) ${wall}s`);
    summaries.push({ ok: false, files: 0, tests: 0, passed: 0, failed: 0, todo: 0, durationMs: 0, failures: [{ file: '(no report)', test: `run ${i + 1} exit ${r.status}`, line: null }] });
    continue;
  }
  summaries.push(summary);
  console.log(`run ${i + 1}: ${summary.ok ? 'green' : 'RED'} files ${summary.files} tests ${summary.tests} passed ${summary.passed} failed ${summary.failed} todo ${summary.todo} ${wall}s`);
}
rmSync(dir, { recursive: true, force: true });

const flakes = findFlakes(summaries);
const consistent = findConsistentFailures(summaries);
console.log(`${summaries.filter((s) => s.ok).length} of ${runs} runs green, ${flakes.length} flaky tests, ${consistent.length} consistent failures`);
for (const f of flakes) console.log(`FLAKE ${f.file}:${f.line ?? '?'} "${f.test}" failed in runs ${f.failedIn.map((n) => n + 1).join(', ')} of ${f.runs}`);
for (const f of consistent) console.log(`FAILS ${f.file}:${f.line ?? '?'} "${f.test}"`);
process.exit(summaries.every((s) => s.ok) ? 0 : 1);
