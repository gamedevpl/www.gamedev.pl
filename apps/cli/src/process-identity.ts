import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const identities = new Map<number, { at: number; value: string | null }>();

export function processStartIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  const cached = identities.get(pid);
  if (cached && ((cached.value && pid === process.pid) || Date.now() - cached.at < 1000)) return cached.value;
  let value: string | null = null;
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const start = stat
        .slice(stat.lastIndexOf(')') + 1)
        .trim()
        .split(/\s+/)[19];
      const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      if (start && /^\d+$/.test(start) && boot) value = `${boot}:${start}`;
    } else if (process.platform === 'win32') {
      const start = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
        ],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (/^\d+$/.test(start)) value = start;
    } else {
      const options = {
        encoding: 'utf8' as const,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
      };
      const start = execFileSync(
        process.platform === 'darwin' ? '/bin/ps' : 'ps',
        ['-p', String(pid), '-o', 'lstart='],
        options,
      ).trim();
      const boot =
        process.platform === 'darwin' ? execFileSync('/usr/sbin/sysctl', ['-n', 'kern.boottime'], options).trim() : '';
      if (start) value = `${boot}:${start}`;
    }
  } catch {
    // Unverifiable owners are never assumed dead.
  }
  identities.set(pid, { at: Date.now(), value });
  return value;
}
