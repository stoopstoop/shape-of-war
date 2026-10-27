// Type checks every code block in docs/pixi8-cheatsheet.md against the installed packages.
// Run: node scripts/check-cheatsheet.ts
//   ```ts      must compile with no errors (v8 forms)
//   ```ts-v7   must produce at least one error (v7 forms that no longer exist in the types)
// Blocks are written to node_modules/.cache/sow-cheatsheet/ (git-ignored) and checked by tsc
// with the repo tsconfig. Exit code is 0 only if every block behaves as tagged.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Expect = 'pass' | 'fail';

interface Block {
  readonly file: string;
  readonly expect: Expect;
  readonly source: string;
}

/** Pure: pull tagged fenced blocks out of markdown, in order. */
export function extractBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const m of markdown.matchAll(/^```(ts|ts-v7)\n([\s\S]*?)^```$/gm)) {
    const tag = m[1] ?? 'ts';
    const raw = m[2] ?? '';
    const n = String(blocks.length + 1).padStart(2, '0');
    // A block with no import or export is a script; make it a module so declarations stay local.
    const source = /^(import|export) /m.test(raw) ? raw : `${raw}\nexport {};\n`;
    blocks.push({ file: `block-${n}.ts`, expect: tag === 'ts' ? 'pass' : 'fail', source });
  }
  return blocks;
}

/** Pure: names of block files that tsc reported at least one error for. */
export function filesWithErrors(tscOutput: string): Set<string> {
  const bad = new Set<string>();
  for (const m of tscOutput.matchAll(/(block-\d+\.ts)\(\d+,\d+\): error/g)) {
    bad.add(m[1] ?? '');
  }
  return bad;
}

function runTsc(root: string, tsconfig: string): string {
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    execFileSync(process.execPath, [tsc, '-p', tsconfig, '--noEmit', '--pretty', 'false'], {
      cwd: root,
      encoding: 'utf8',
    });
    return '';
  } catch (err) {
    const e = err as { stdout?: string };
    return e.stdout ?? String(err);
  }
}

function main(): void {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const blocks = extractBlocks(readFileSync(join(root, 'docs', 'pixi8-cheatsheet.md'), 'utf8'));
  const dir = join(root, 'node_modules', '.cache', 'sow-cheatsheet');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const b of blocks) writeFileSync(join(dir, b.file), b.source);
  const config = { extends: '../../../tsconfig.json', include: ['*.ts'] };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config, null, 2));

  const output = runTsc(root, join(dir, 'tsconfig.json'));
  const bad = filesWithErrors(output);
  let failures = 0;
  for (const b of blocks) {
    const hasErrors = bad.has(b.file);
    const ok = b.expect === 'pass' ? !hasErrors : hasErrors;
    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${b.file} expected ${b.expect}, tsc ${hasErrors ? 'errors' : 'clean'}`);
  }
  const unexpected = output
    .split('\n')
    .filter((l) => l.includes('error') && !/block-\d+\.ts\(/.test(l));
  for (const l of unexpected) console.log(`FAIL outside blocks: ${l}`);
  failures += unexpected.length;
  const passBlocks = blocks.filter((b) => b.expect === 'pass').length;
  console.log(`checked ${blocks.length} blocks (${passBlocks} v8 must compile, ${blocks.length - passBlocks} v7 must fail), ${failures} failure(s)`);
  if (failures > 0) {
    console.log('--- tsc output ---');
    console.log(output);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
