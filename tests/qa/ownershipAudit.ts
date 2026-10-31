// Edge: ownership audit CLI. Not a test (vitest only collects *.test.ts). Run from the repo root:
//   node tests/qa/ownershipAudit.ts <base> <branch> <agent> [wave | --owns=<list>]
// v1:  node tests/qa/ownershipAudit.ts g2 feat/ledger-complete ledger
// v2:  node tests/qa/ownershipAudit.ts 15c8e1b^1 15c8e1b^2 forge A   (wave A to E, docs/10 tables)
// v3:  node tests/qa/ownershipAudit.ts <merge>^1 <merge>^2 swarm v3B  (v3A, v3B, v3C1, v3C2, v3D, v3E, v3H, v3G0, v3G1, docs/12 tables)
// fix: node tests/qa/ownershipAudit.ts main feat/glow-v2-fixes glow --owns=src/render/,tests/render/
// With no fourth argument the v1 table is used. A merged branch whose name is gone can be audited by its
// merge commit: <base> is <merge>^1 and <branch> is <merge>^2.
// Prints every file changed on <branch> since it forked from <base> (three dot diff), marks the ones
// outside the agent's owned paths, and exits 1 if there are any. Needs Node 22.18 or newer (type stripping).
import { execFileSync } from 'node:child_process';
import { OWNERS, OWNERS_V2, OWNERS_V3, V3_WAVES, WAVES, auditPaths, ownsFromList, parseNameStatus, parseV3Wave, parseWave } from './ownership.ts';

const [base, branch, agent, extra] = process.argv.slice(2);
const owns = extra?.startsWith('--owns=') === true ? extra.slice('--owns='.length) : null;
const v3 = owns === null ? parseV3Wave(extra) : null;
const wave = owns === null && v3 === null ? parseWave(extra) : null;
const table =
  owns !== null && agent !== undefined ? { [agent]: ownsFromList(owns) } : v3 !== null ? OWNERS_V3[v3] : wave !== null ? OWNERS_V2[wave] : OWNERS;
if (base === undefined || branch === undefined || agent === undefined || table[agent] === undefined || (extra !== undefined && owns === null && wave === null && v3 === null)) {
  console.error(
    `usage: node tests/qa/ownershipAudit.ts <base> <branch> <agent: ${Object.keys(table).join('|')}> [${WAVES.join('|')} | ${V3_WAVES.map((x) => `v3${x}`).join('|')} | --owns=<list>]`,
  );
  process.exit(2);
}

const diff = execFileSync('git', ['diff', '--name-status', `${base}...${branch}`], { encoding: 'utf8' });
const changes = parseNameStatus(diff);
const audit = auditPaths(agent, changes, table);
const outside = new Set(audit.outside);

const label = v3 !== null ? `, v3 wave ${v3}` : wave !== null ? `, wave ${wave}` : owns !== null ? `, owns ${owns}` : `, v1`;
console.log(`${branch} vs ${base} (${agent}${label}): ${changes.length} changed paths, ${audit.outside.length} outside ownership`);
for (const c of changes) console.log(`${outside.has(c.path) ? 'OUTSIDE' : 'ok     '} ${c.status.padEnd(4)} ${c.path}`);
process.exit(audit.outside.length === 0 ? 0 : 1);
