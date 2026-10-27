// Edge: ownership audit CLI. Not a test (vitest only collects *.test.ts). Run from the repo root:
//   node tests/qa/ownershipAudit.ts <base> <branch> <agent>
// for example: node tests/qa/ownershipAudit.ts g2 feat/ledger-complete ledger
// Prints every file changed on <branch> since it forked from <base> (three dot diff), marks the ones
// outside the agent's owned paths, and exits 1 if there are any. Needs Node 22.18 or newer (type stripping).
import { execFileSync } from 'node:child_process';
import { OWNERS, auditPaths, parseNameStatus } from './ownership.ts';

const [base, branch, agent] = process.argv.slice(2);
if (base === undefined || branch === undefined || agent === undefined || OWNERS[agent] === undefined) {
  console.error(`usage: node tests/qa/ownershipAudit.ts <base> <branch> <agent: ${Object.keys(OWNERS).join('|')}>`);
  process.exit(2);
}

const diff = execFileSync('git', ['diff', '--name-status', `${base}...${branch}`], { encoding: 'utf8' });
const changes = parseNameStatus(diff);
const audit = auditPaths(agent, changes);
const outside = new Set(audit.outside);

console.log(`${branch} vs ${base} (${agent}): ${changes.length} changed paths, ${audit.outside.length} outside ownership`);
for (const c of changes) console.log(`${outside.has(c.path) ? 'OUTSIDE' : 'ok     '} ${c.status.padEnd(4)} ${c.path}`);
process.exit(audit.outside.length === 0 ? 0 : 1);
