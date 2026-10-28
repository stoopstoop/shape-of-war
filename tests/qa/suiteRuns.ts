// Pure helpers for repeatSuite.ts: read the JSON that `vitest run --reporter=json` writes and say
// which tests failed in some runs but not in all of them (a flake) and where. No imports, so Node
// can run the CLI with type stripping. Not a test file (vitest only collects *.test.ts).

export interface Failure {
  /** Repo relative test file. */
  file: string;
  /** Full test name, ancestors joined with " > ". */
  test: string;
  /** Line of the first stack frame inside tests/, or null when the message has none. */
  line: number | null;
}

export interface RunSummary {
  ok: boolean;
  files: number;
  tests: number;
  passed: number;
  failed: number;
  todo: number;
  /** Wall time of the whole run, ms (last test end minus first test start). */
  durationMs: number;
  failures: Failure[];
}

export interface FlakeReport {
  file: string;
  test: string;
  line: number | null;
  /** Runs (0 based) in which it failed, and how many runs there were. */
  failedIn: number[];
  runs: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Pure: path relative to the repo root, using forward slashes. root has no trailing slash. */
export function relativeTo(root: string, file: string): string {
  const f = file.split('\\').join('/');
  const r = root.split('\\').join('/').replace(/\/+$/, '');
  return f.startsWith(`${r}/`) ? f.slice(r.length + 1) : f;
}

/** Pure: the line of the first `tests/...:line:col` frame in failure messages, or null. */
export function firstTestLine(messages: readonly string[]): number | null {
  for (const m of messages) {
    const hit = /(?:^|[\s(])(tests\/[^\s:()]+\.ts):(\d+):\d+/.exec(m);
    if (hit !== null) return Number(hit[2]);
  }
  return null;
}

/**
 * Pure: summarise one vitest JSON report. Returns null when the value is not a report.
 * root is the repo root, used to make file names relative.
 */
export function summariseRun(report: unknown, root: string): RunSummary | null {
  if (!isRecord(report) || !Array.isArray(report.testResults)) return null;
  const failures: Failure[] = [];
  let first = Infinity;
  let last = 0;
  for (const file of report.testResults) {
    if (!isRecord(file)) continue;
    const name = relativeTo(root, str(file.name));
    first = Math.min(first, num(file.startTime) || Infinity);
    last = Math.max(last, num(file.endTime));
    const results = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    for (const a of results) {
      if (!isRecord(a) || a.status !== 'failed') continue;
      const messages = Array.isArray(a.failureMessages) ? a.failureMessages.map(str) : [];
      const parts = Array.isArray(a.ancestorTitles) ? a.ancestorTitles.map(str) : [];
      failures.push({ file: name, test: [...parts, str(a.title)].join(' > '), line: firstTestLine(messages) });
    }
    // A file that failed to load has no assertion results but a failed status: count it once.
    if (results.length === 0 && file.status === 'failed') failures.push({ file: name, test: '(file failed to load)', line: firstTestLine([str(file.message)]) });
  }
  return {
    ok: report.success === true && failures.length === 0,
    files: report.testResults.length,
    tests: num(report.numTotalTests),
    passed: num(report.numPassedTests),
    failed: num(report.numFailedTests),
    todo: num(report.numTodoTests),
    durationMs: Number.isFinite(first) && last > first ? Math.round(last - first) : 0,
    failures,
  };
}

/** Pure: tests that failed in at least one run but not in every run. A test failing in all runs is a plain failure, not a flake. */
export function findFlakes(runs: readonly RunSummary[]): FlakeReport[] {
  const byKey = new Map<string, FlakeReport>();
  runs.forEach((run, i) => {
    for (const f of run.failures) {
      const key = `${f.file}\u0000${f.test}`;
      const known = byKey.get(key);
      if (known === undefined) byKey.set(key, { file: f.file, test: f.test, line: f.line, failedIn: [i], runs: runs.length });
      else {
        known.failedIn.push(i);
        if (known.line === null) known.line = f.line;
      }
    }
  });
  return [...byKey.values()].filter((r) => r.failedIn.length < runs.length).sort((a, b) => a.file.localeCompare(b.file) || a.test.localeCompare(b.test));
}

/** Pure: tests that failed in every run. */
export function findConsistentFailures(runs: readonly RunSummary[]): Failure[] {
  const first = runs[0];
  if (first === undefined) return [];
  return first.failures.filter((f) => runs.every((r) => r.failures.some((g) => g.file === f.file && g.test === f.test)));
}
