import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = ['data', 'proofs', 'evidence'];

function git(args) {
  const windows = process.platform === 'win32';
  return spawnSync(windows ? 'wsl.exe' : 'git', windows ? ['--exec', 'git', ...args] : args, {
    cwd: root, encoding: 'utf8', timeout: 12000, windowsHide: true,
  });
}

// Cite a Git snapshot only when it contains the evidence the reader is seeing.
export function resolveRevision(explicit) {
  if (explicit && !/^[0-9a-f]{40}$/i.test(explicit)) {
    throw new Error('The source revision must be a full Git commit SHA.');
  }
  const head = git(['rev-parse', '--verify', (explicit || 'HEAD') + '^{commit}']);
  if (head.status !== 0) return null;
  const sha = head.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) return null;
  const diff = git(['diff', '--quiet', sha, '--', ...inputs]);
  const extra = git(['ls-files', '--others', '--exclude-standard', '--', ...inputs]);
  return diff.status === 0 && extra.status === 0 && !extra.stdout.trim() ? sha : null;
}
