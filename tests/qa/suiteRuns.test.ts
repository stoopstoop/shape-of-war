import { describe, expect, it } from 'vitest';
import { findConsistentFailures, findFlakes, firstTestLine, relativeTo, summariseRun } from './suiteRuns';
import type { RunSummary } from './suiteRuns';

const ROOT = '/work/repo';

function report(over: Record<string, unknown> = {}, failedTests: { file: string; title: string; ancestors?: string[]; message?: string }[] = []): unknown {
  const byFile = new Map<string, unknown[]>();
  for (const f of failedTests) {
    const list = byFile.get(f.file) ?? [];
    list.push({ status: 'failed', title: f.title, ancestorTitles: f.ancestors ?? [], failureMessages: [f.message ?? 'boom'] });
    byFile.set(f.file, list);
  }
  return {
    success: failedTests.length === 0,
    numTotalTests: 10,
    numPassedTests: 10 - failedTests.length,
    numFailedTests: failedTests.length,
    numTodoTests: 1,
    testResults: [
      { name: `${ROOT}/tests/a.test.ts`, startTime: 1000, endTime: 1500, status: 'passed', assertionResults: [{ status: 'passed', title: 'ok', ancestorTitles: [] }] },
      ...[...byFile.entries()].map(([name, assertionResults]) => ({ name: `${ROOT}/${name}`, startTime: 1200, endTime: 4000, status: 'failed', assertionResults })),
    ],
    ...over,
  };
}

const run = (failures: { file: string; test: string; line?: number | null }[]): RunSummary => ({
  ok: failures.length === 0,
  files: 3,
  tests: 10,
  passed: 10 - failures.length,
  failed: failures.length,
  todo: 0,
  durationMs: 1,
  failures: failures.map((f) => ({ file: f.file, test: f.test, line: f.line ?? null })),
});

describe('relativeTo', () => {
  it('strips the root and normalises separators, and leaves other paths alone', () => {
    expect(relativeTo('/work/repo', '/work/repo/tests/a.test.ts')).toBe('tests/a.test.ts');
    expect(relativeTo('/work/repo/', '/work/repo/tests/a.test.ts')).toBe('tests/a.test.ts');
    expect(relativeTo('C:\\work\\repo', 'C:\\work\\repo\\tests\\a.test.ts')).toBe('tests/a.test.ts');
    expect(relativeTo('/work/repo', '/elsewhere/x.ts')).toBe('/elsewhere/x.ts');
    expect(relativeTo('/work/repo', '/work/repository/x.ts')).toBe('/work/repository/x.ts');
  });
});

describe('firstTestLine', () => {
  it('finds the first frame inside tests/ and ignores node_modules frames', () => {
    const msg = 'AssertionError: x\n    at node_modules/vitest/dist/x.js:10:5\n    at tests/game/weapons.test.ts:212:19\n    at tests/qa/other.test.ts:9:1';
    expect(firstTestLine([msg])).toBe(212);
    expect(firstTestLine(['at Object.<anonymous> (tests/qa/x.test.ts:77:3)'])).toBe(77);
  });

  it('is null when no frame is in tests/', () => {
    expect(firstTestLine([])).toBeNull();
    expect(firstTestLine(['Error: nothing useful', 'at src/game/world.ts:1:1'])).toBeNull();
  });
});

describe('summariseRun', () => {
  it('reads counts, wall time and a green run', () => {
    const s = summariseRun(report(), ROOT);
    expect(s).toMatchObject({ ok: true, files: 1, tests: 10, passed: 10, failed: 0, todo: 1, durationMs: 500, failures: [] });
  });

  it('reads failures with their file, full name and line', () => {
    const s = summariseRun(report({}, [{ file: 'tests/b.test.ts', title: 'does a thing', ancestors: ['suite', 'inner'], message: 'x\n at tests/b.test.ts:42:7' }]), ROOT);
    expect(s?.ok).toBe(false);
    expect(s?.failures).toEqual([{ file: 'tests/b.test.ts', test: 'suite > inner > does a thing', line: 42 }]);
    expect(s?.durationMs).toBe(3000);
  });

  it('counts a file that failed to load once', () => {
    const r = { success: false, numTotalTests: 0, testResults: [{ name: `${ROOT}/tests/c.test.ts`, status: 'failed', message: 'SyntaxError\n at tests/c.test.ts:3:1', assertionResults: [] }] };
    expect(summariseRun(r, ROOT)?.failures).toEqual([{ file: 'tests/c.test.ts', test: '(file failed to load)', line: 3 }]);
  });

  it('returns null for anything that is not a report', () => {
    expect(summariseRun(null, ROOT)).toBeNull();
    expect(summariseRun([], ROOT)).toBeNull();
    expect(summariseRun({ testResults: 3 }, ROOT)).toBeNull();
    expect(summariseRun('x', ROOT)).toBeNull();
  });
});

describe('findFlakes and findConsistentFailures', () => {
  const a = { file: 'tests/a.test.ts', test: 'one', line: 10 };
  const b = { file: 'tests/b.test.ts', test: 'two', line: null };

  it('a test that fails in some runs only is a flake, with the runs and the line', () => {
    const flakes = findFlakes([run([]), run([a]), run([]), run([{ ...a, line: null }])]);
    expect(flakes).toEqual([{ file: 'tests/a.test.ts', test: 'one', line: 10, failedIn: [1, 3], runs: 4 }]);
  });

  it('a test that fails in every run is a plain failure, not a flake', () => {
    const runs = [run([b]), run([b]), run([b])];
    expect(findFlakes(runs)).toEqual([]);
    expect(findConsistentFailures(runs)).toEqual([{ file: 'tests/b.test.ts', test: 'two', line: null }]);
  });

  it('ten green runs have neither', () => {
    const runs = Array.from({ length: 10 }, () => run([]));
    expect(findFlakes(runs)).toEqual([]);
    expect(findConsistentFailures(runs)).toEqual([]);
    expect(findConsistentFailures([])).toEqual([]);
  });

  it('separates a flake from a consistent failure in the same set and sorts flakes by file then name', () => {
    const c = { file: 'tests/a.test.ts', test: 'zzz', line: 5 };
    const runs = [run([b, c, a]), run([b, a]), run([b])];
    expect(findFlakes(runs).map((f) => `${f.file}:${f.test}`)).toEqual(['tests/a.test.ts:one', 'tests/a.test.ts:zzz']);
    expect(findConsistentFailures(runs).map((f) => f.test)).toEqual(['two']);
  });
});
