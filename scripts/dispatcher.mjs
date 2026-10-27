#!/usr/bin/env node
// Shape of War dispatcher. Node 22, zero dependencies, ESM.
// Canon: SPEC.md section 7.2. Job formats: .agents/README.md.
// Ryan starts it once with `npm run dispatcher` in the Shape of War terminal.
// Fable (Claude Desktop) queues jobs by writing .agents/queue/<seq>-<nickname>-<slug>.json.

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = path.join(REPO, '.agents');
const DIRS = {
  queue: path.join(AGENTS, 'queue'),
  running: path.join(AGENTS, 'running'),
  done: path.join(AGENTS, 'done'),
  failed: path.join(AGENTS, 'failed'),
  runs: path.join(AGENTS, 'runs'),
};

const intEnv = (name, def) => {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const MAX_PARALLEL = intEnv('MAX_PARALLEL', 4);
const MAX_TURNS = intEnv('MAX_TURNS', 200);
const WALL_MS = intEnv('WALL_MS', 90 * 60 * 1000);
const SHELL_WALL_MS = intEnv('SHELL_WALL_MS', 30 * 60 * 1000);
const POLL_MS = 2000;
const SETTLE_MS = 1000; // ignore queue files modified in the last second (partial writes)
const KILL_GRACE_MS = 10000;
const STDOUT_KEEP = 20 * 1024 * 1024;

// Shell allowlist: a cmd matching any of these is rejected and never run.
const DENY = [
  [/push[^&|;]*--force/, 'push --force'],
  [/push\b[^&|;]*\s-f(\s|$)/, 'push -f'],
  [/reset\s+--hard/, 'reset --hard'],
  [/\brebase\b/, 'rebase'],
  [/filter-branch/, 'filter-branch'],
  [/~/, '~'],
  [/\$HOME|\$\{HOME\}/, '$HOME'],
  [/\bsudo\b/, 'sudo'],
  [/curl .*\|.*sh/, 'curl piped to sh'],
];

const ts = () => new Date().toISOString();
const say = (msg) => console.log(`${ts()} ${msg}`);

// ---------- validation ----------

function shellDenyReason(cmd) {
  for (const [re, label] of DENY) if (re.test(cmd)) return `allowlist: matches ${label}`;
  // rm -rf only when every target starts with ../sow- and has no further ..
  for (const seg of cmd.split(/&&|\|\||;|\||\n/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    const i = toks.indexOf('rm');
    if (i === -1) continue;
    const args = toks.slice(i + 1);
    const flags = args.filter((a) => a.startsWith('-')).join('');
    if (!(/r|R/.test(flags) && /f/.test(flags))) continue;
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) return 'allowlist: rm -rf with no target';
    for (const t of targets) {
      const clean = t.replace(/^['"]|['"]$/g, '');
      if (!clean.startsWith('../sow-') || clean.slice(2).includes('..')) {
        return `allowlist: rm -rf outside ../sow- (${clean})`;
      }
    }
  }
  return null;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function validateJob(job) {
  if (!job || typeof job !== 'object') return 'job is not a JSON object';
  if (job.type !== 'agent' && job.type !== 'shell') return 'type must be "agent" or "shell"';
  if (typeof job.nickname !== 'string' || !NAME_RE.test(job.nickname)) return 'nickname must match [a-z0-9-]';
  if (typeof job.slug !== 'string' || !NAME_RE.test(job.slug)) return 'slug must match [a-z0-9-]';
  if (job.type === 'agent') {
    for (const k of ['model', 'branch', 'worktree', 'brief']) {
      if (typeof job[k] !== 'string' || job[k].trim() === '') return `agent job needs string "${k}"`;
    }
    if (!/^[A-Za-z0-9._\/-]+$/.test(job.branch) || job.branch === 'main') return 'branch invalid or main';
    if (!job.worktree.startsWith('../sow-') || job.worktree.slice(2).includes('..')) {
      return 'worktree must start with ../sow- and contain no further ..';
    }
    const roster = path.join(REPO, '.claude', 'agents', `${job.nickname}.md`);
    if (!fs.existsSync(roster)) return `roster file missing: .claude/agents/${job.nickname}.md`;
  } else {
    if (typeof job.cmd !== 'string' || job.cmd.trim() === '') return 'shell job needs string "cmd"';
    if (job.cwd !== undefined && typeof job.cwd !== 'string') return 'cwd must be a string';
    const deny = shellDenyReason(job.cmd);
    if (deny) return deny;
    const cwd = path.resolve(REPO, job.cwd ?? '.');
    if (!fs.existsSync(cwd)) return `cwd does not exist: ${job.cwd}`;
  }
  return null;
}

// ---------- helpers ----------

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function headSha(cwd) {
  try { return git(['rev-parse', 'HEAD'], cwd); } catch { return null; }
}

let gitChain = Promise.resolve();
function withGitLock(fn) {
  const next = gitChain.then(fn, fn);
  gitChain = next.catch(() => {});
  return next;
}

function ensureBranchAndWorktree(job, log) {
  const wt = path.resolve(REPO, job.worktree);
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/heads/${job.branch}`]);
  } catch {
    log(`git branch ${job.branch} main\n`);
    git(['branch', job.branch, 'main']);
  }
  if (fs.existsSync(wt)) {
    if (!fs.existsSync(path.join(wt, '.git'))) throw new Error(`worktree path exists but is not a git worktree: ${job.worktree}`);
    const cur = git(['rev-parse', '--abbrev-ref', 'HEAD'], wt);
    if (cur !== job.branch) throw new Error(`worktree ${job.worktree} is on ${cur}, expected ${job.branch}`);
  } else {
    log(`git worktree add ${job.worktree} ${job.branch}\n`);
    git(['worktree', 'add', wt, job.branch]);
  }
  return wt;
}

function parseClaudeJson(stdout) {
  const t = stdout.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const lines = t.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l.startsWith('{')) continue;
    try { return JSON.parse(l); } catch { /* keep looking */ }
  }
  return null;
}

// ---------- startup checks ----------

const key = process.env.ANTHROPIC_API_KEY ?? '';
if (!key) {
  console.error('dispatcher: ANTHROPIC_API_KEY is not set. Export it in this terminal (runbook section B.2) and rerun.');
  process.exit(1);
}

let claudeVersion;
let claudeHelp = '';
try {
  claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  claudeHelp = execFileSync('claude', ['--help'], { encoding: 'utf8' });
} catch (e) {
  console.error(`dispatcher: cannot run claude (${e.message}). Install Claude Code (runbook section A) and rerun.`);
  process.exit(1);
}
const HAS_APPEND_FILE = claudeHelp.includes('--append-system-prompt-file');

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

console.log(`dispatcher: watching .agents/queue (max parallel ${MAX_PARALLEL})`);
console.log(`dispatcher: claude ${claudeVersion}`);
console.log(`dispatcher: api key sk-ant-...${key.slice(-4)}`);
if (!HAS_APPEND_FILE) say('note: claude --help lacks --append-system-prompt-file; roster files will be prepended to briefs');

// ---------- run bookkeeping ----------

const running = new Map(); // id -> { job, child, cwdKey }
let stopping = false;

function finish(id, job, base, res) {
  const runDir = path.join(DIRS.runs, id);
  const result = {
    id,
    type: job?.type ?? null,
    nickname: job?.nickname ?? null,
    slug: job?.slug ?? null,
    exitCode: res.exitCode,
    startedAt: base.startedAt,
    endedAt: res.endedAt,
    durationMs: Date.parse(res.endedAt) - Date.parse(base.startedAt),
    ...(res.costUsd !== undefined ? { costUsd: res.costUsd } : {}),
    branch: job?.type === 'agent' ? job.branch : null,
    headSha: res.headSha ?? null,
    error: res.error ?? null,
  };
  fs.mkdirSync(runDir, { recursive: true });
  writeAtomic(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  const ok = res.exitCode === 0 && !res.error;
  const from = path.join(DIRS.running, `${id}.json`);
  const to = path.join(ok ? DIRS.done : DIRS.failed, `${id}.json`);
  try { fs.renameSync(from, to); } catch { /* already moved */ }
  say(`${ok ? 'done' : 'failed'} ${id} exit=${res.exitCode}${res.error ? ` error="${res.error}"` : ''}${res.costUsd !== undefined ? ` cost=$${res.costUsd}` : ''}`);
}

function runProcess(id, job, argv, cwd, wallMs, onStdout) {
  return new Promise((resolve) => {
    const runDir = path.join(DIRS.runs, id);
    const logStream = fs.createWriteStream(path.join(runDir, 'log.txt'), { flags: 'a' });
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = running.get(id);
    if (entry) entry.child = child;
    let timedOut = false;
    let interrupted = false;
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
    const timer = setTimeout(() => {
      timedOut = true;
      say(`timeout ${id} after ${Math.round(wallMs / 60000)} min, SIGTERM`);
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref();
    }, wallMs);
    if (entry) entry.interrupt = () => { interrupted = true; killGroup('SIGTERM'); setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref(); };
    child.stdout.on('data', (b) => { logStream.write(b); onStdout?.(b); });
    child.stderr.on('data', (b) => logStream.write(b));
    child.on('error', (e) => logStream.write(`\n[dispatcher] spawn error: ${e.message}\n`));
    // stragglers in the process group can hold the stdout pipe open and block 'close'; reap them on exit
    child.on('exit', () => killGroup('SIGTERM'));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      logStream.end(`\n[dispatcher] exit code=${code} signal=${signal ?? 'none'}\n`);
      const exitCode = code ?? 128;
      let error = null;
      if (timedOut) error = `wall clock limit ${wallMs} ms exceeded`;
      else if (interrupted) error = 'interrupted: dispatcher stopped';
      else if (signal) error = `killed by ${signal}`;
      resolve({ exitCode, error });
    });
  });
}

async function runAgent(id, job, base) {
  const runDir = path.join(DIRS.runs, id);
  const logFile = path.join(runDir, 'log.txt');
  const log = (s) => fs.appendFileSync(logFile, s);
  let wt;
  try {
    wt = await withGitLock(() => ensureBranchAndWorktree(job, log));
  } catch (e) {
    log(`[dispatcher] setup failed: ${e.message}\n`);
    return { exitCode: 1, error: `setup: ${e.message}`, endedAt: ts() };
  }
  if (stopping) return { exitCode: 1, error: 'interrupted: dispatcher stopped before launch', headSha: headSha(wt), endedAt: ts() };
  const roster = path.join(REPO, '.claude', 'agents', `${job.nickname}.md`);
  const argv = ['claude', '-p', '--model', job.model, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--max-turns', String(MAX_TURNS)];
  let brief = job.brief;
  if (HAS_APPEND_FILE) argv.push('--append-system-prompt-file', roster);
  else brief = `${fs.readFileSync(roster, 'utf8')}\n\n---\n\n${brief}`;
  // absolute worktree path in argv so `pkill -f "<worktree>"` can find this run (runbook I.5)
  argv.push(`${brief}\n\n(dispatcher run ${id}, worktree ${wt})`);
  log(`[dispatcher] ${ts()} claude -p --model ${job.model} in ${job.worktree}\n`);

  let out = '';
  const res = await runProcess(id, job, argv, wt, WALL_MS, (b) => {
    out += b.toString('utf8');
    if (out.length > STDOUT_KEEP) out = out.slice(-STDOUT_KEEP);
  });
  const parsed = parseClaudeJson(out);
  let handoff;
  let costUsd;
  let error = res.error;
  if (parsed && typeof parsed === 'object') {
    handoff = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed, null, 2);
    const c = parsed.total_cost_usd ?? parsed.cost_usd;
    if (typeof c === 'number') costUsd = c;
    if (!error && parsed.is_error) error = `claude reported error: ${parsed.subtype ?? 'unknown'}`;
  } else {
    handoff = out.split('\n').slice(-80).join('\n');
    if (!error && res.exitCode === 0) error = 'could not parse claude JSON output';
  }
  writeAtomic(path.join(runDir, 'handoff.md'), handoff.endsWith('\n') ? handoff : handoff + '\n');
  return { exitCode: res.exitCode, error, costUsd, headSha: headSha(wt), endedAt: ts() };
}

async function runShell(id, job) {
  const cwd = path.resolve(REPO, job.cwd ?? '.');
  fs.appendFileSync(path.join(DIRS.runs, id, 'log.txt'), `[dispatcher] ${ts()} bash -lc in ${job.cwd ?? '.'}: ${job.cmd}\n`);
  const res = await runProcess(id, job, ['bash', '-lc', job.cmd], cwd, SHELL_WALL_MS);
  return { exitCode: res.exitCode, error: res.error, headSha: headSha(cwd), endedAt: ts() };
}

// ---------- queue scanning ----------

function rejectInQueue(file, id, job, reason) {
  const runDir = path.join(DIRS.runs, id);
  const startedAt = ts();
  if (fs.existsSync(path.join(runDir, 'result.json'))) {
    // never clobber an earlier run's evidence
    const dup = path.join(DIRS.failed, `${id}.duplicate-${Date.now()}.json`);
    try { fs.renameSync(file, dup); } catch { /* claimed elsewhere */ }
    say(`rejected ${id}: ${reason} (moved to failed/${path.basename(dup)})`);
    return;
  }
  try { fs.renameSync(file, path.join(DIRS.running, `${id}.json`)); } catch { return; }
  fs.mkdirSync(runDir, { recursive: true });
  fs.appendFileSync(path.join(runDir, 'log.txt'), `[dispatcher] ${startedAt} rejected: ${reason}\n`);
  say(`rejected ${id}: ${reason}`);
  finish(id, job, { startedAt }, { exitCode: 1, error: reason, endedAt: ts() });
}

let scanning = false;
function scan() {
  if (scanning || stopping) return;
  scanning = true;
  try {
    const files = fs.readdirSync(DIRS.queue).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      if (running.size >= MAX_PARALLEL) break;
      const file = path.join(DIRS.queue, f);
      const id = f.slice(0, -5);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      if (Date.now() - st.mtimeMs < SETTLE_MS) continue;
      let job;
      try { job = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
        rejectInQueue(file, id, null, `invalid JSON: ${e.message}`);
        continue;
      }
      const invalid = validateJob(job);
      if (invalid) { rejectInQueue(file, id, job, invalid); continue; }
      if (running.has(id) || fs.existsSync(path.join(DIRS.runs, id, 'result.json'))) {
        rejectInQueue(file, id, job, 'duplicate id: requeue with a new seq');
        continue;
      }
      // shell jobs on the same cwd run one at a time, in filename order
      const cwdKey = job.type === 'shell' ? path.resolve(REPO, job.cwd ?? '.') : null;
      if (cwdKey && [...running.values()].some((r) => r.cwdKey === cwdKey)) continue;
      try { fs.renameSync(file, path.join(DIRS.running, f)); } catch { continue; }
      start(id, job, cwdKey);
    }
  } finally {
    scanning = false;
  }
}

function start(id, job, cwdKey) {
  const runDir = path.join(DIRS.runs, id);
  fs.mkdirSync(runDir, { recursive: true });
  const base = { startedAt: ts() };
  running.set(id, { job, child: null, cwdKey });
  say(`claimed ${id} (${job.type} ${job.nickname}${job.type === 'agent' ? ` ${job.model} ${job.branch}` : ''})`);
  const p = job.type === 'agent' ? runAgent(id, job, base) : runShell(id, job);
  p.catch((e) => ({ exitCode: 1, error: `dispatcher: ${e.message}`, endedAt: ts() }))
    .then((res) => {
      finish(id, job, base, res);
      running.delete(id);
      if (stopping && running.size === 0) process.exit(0);
      scan();
    });
}

// Stale jobs left in running/ by a dispatcher that died: fail them so Fable sees it.
for (const f of fs.readdirSync(DIRS.running).filter((x) => x.endsWith('.json'))) {
  const id = f.slice(0, -5);
  let job = null;
  try { job = JSON.parse(fs.readFileSync(path.join(DIRS.running, f), 'utf8')); } catch { /* keep null */ }
  fs.mkdirSync(path.join(DIRS.runs, id), { recursive: true });
  say(`stale ${id}: found in running/ at startup`);
  finish(id, job, { startedAt: ts() }, { exitCode: 1, error: 'stale: dispatcher restarted while job was running; requeue with a new seq', endedAt: ts() });
}

try { fs.watch(DIRS.queue, () => setTimeout(scan, SETTLE_MS + 50)); } catch { /* polling still works */ }
setInterval(scan, POLL_MS);
scan();

process.on('SIGINT', () => {
  if (stopping) { say('second SIGINT, exiting now'); process.exit(130); }
  stopping = true;
  const ids = [...running.keys()];
  say(`SIGINT: claiming nothing new. running: ${ids.length ? ids.join(', ') : 'none'}`);
  if (ids.length === 0) process.exit(0);
  say('terminating running jobs; they land in failed/ with error "interrupted"');
  for (const r of running.values()) r.interrupt?.();
});
