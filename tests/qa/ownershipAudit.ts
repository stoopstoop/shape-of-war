// Edge: ownership audit CLI. Not a test (vitest only collects *.test.ts). Run from the repo root:
//   node tests/qa/ownershipAudit.ts <base> <branch> <agent> [wave | --owns=<list>]
// v1:  node tests/qa/ownershipAudit.ts g2 feat/ledger-complete ledger
// v2:  node tests/qa/ownershipAudit.ts 15c8e1b^1 15c8e1b^2 forge A   (wave A to E, docs/10 tables)
// fix: node tests/qa/ownershipAudit.ts main feat/glow-v2-fixes glow --owns=src/render/,tests/render/
// With no fourth argument the v1 table is used. A merged branch whose name is gone can be audited by its
// merge commit: <base> is <merge>^1 and <branch> is <merge>^2.
// Prints every file changed on <branch> since it forked from <base> (three dot diff), marks the ones
// outside the agent's owned paths, and exits 1 if there are any. Needs Node 22.18 or newer (type stripping).
import { execFileSync } from 'node:child_process';
import { OWNERS, OWNERS_V2, WAVES, auditPaths, ownsFromList, parseNameStatus, parseWave } from './ownership.ts';

const [base, branch, agent, extra] = process.argv.slice(2);
const owns = extra?.startsWith('--owns=') === true ? extra.slice('--owns='.length) : null;
const wave = owns === null ? parseWave(extra) : null;
const table = owns !== null && agent !== undefined ? { [agent]: ownsFromList(owns) } : wave !== null ? OWNERS_V2[wave] : OWNERS;
if (base === undefined || branch === undefined || agent === undefined || table[agent] === undefined || (extra !== undefined && owns === null && wave === null)) {
  console.error(`usage: node tests/qa/ownershipAudit.ts <base> <branch> <agent: ${Object.keys(table).join('|')}> [${WAVES.join('|')} | --owns=<list>]`);
  process.exit(2);
}

const diff = execFileSync('git', ['diff', '--name-status', `${base}...${branch}`], { encoding: 'utf8' });
const changes = parseNameStatus(diff);
const audit = auditPaths(agent, changes, table);
const outside = new Set(audit.outside);

console.log(`${branch} vs ${base} (${agent}${wave !== null ? `, wave ${wave}` : owns !== null ? `, owns ${owns}` : `, v1`}): ${changes.length} changed paths, ${audit.outside.length} outside ownership`);
for (const c of changes) console.log(`${outside.has(c.path) ? 'OUTSIDE' : 'ok     '} ${c.status.padEnd(4)} ${c.path}`);
process.exit(audit.outside.length === 0 ? 0 : 1);
