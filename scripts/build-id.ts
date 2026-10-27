import { execSync } from 'node:child_process';

/** Pure: pad a number to two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Pure: format a build id as "<sha> <YYYY-MM-DD>T<HH:MM>Z" in UTC. */
export function formatBuildId(sha: string, now: Date): string {
  const date = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  const time = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
  return `${sha} ${date}T${time}Z`;
}

/** Edge: read the short git sha, or "nogit" when git or a repo is unavailable. */
export function readShortSha(): string {
  try {
    const out = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
    const sha = out.toString().trim();
    return sha.length > 0 ? sha : 'nogit';
  } catch {
    return 'nogit';
  }
}

/** Edge: the build id for this build, evaluated once per vite invocation. */
export function currentBuildId(): string {
  return formatBuildId(readShortSha(), new Date());
}
