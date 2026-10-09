// Candidate code runs as an unprivileged user. See infra/gate-hardening.md.

import { execFile, spawn } from 'node:child_process';
import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Metadata server: hands out the build's service-account token.
const METADATA_ADDRESS = '169.254.169.254';

// Denylist, not allowlist: the harness toolchain reads env we don't own.
const CREDENTIAL_ENV = /TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$|^GATE_VERDICT_/i;

export function scrubbedEnv(base: NodeJS.ProcessEnv, overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined || CREDENTIAL_ENV.test(name)) continue;
    env[name] = value;
  }
  return { ...env, ...overrides };
}

export interface GateSandbox {
  user: string;
  uid: number;
  gid: number;
  // Writable HOME; Cloud Build's per-step HOME belongs to root.
  home: string;
  adopt(dir: string): Promise<void>;
  // SIGKILLs every sandbox-user process.
  reap(): Promise<number>;
  // Best effort: rejects sandbox-user traffic to the metadata server.
  blockMetadata(): Promise<boolean>;
  dispose(): Promise<void>;
}

async function idOf(user: string, flag: '-u' | '-g'): Promise<number> {
  const { stdout } = await execFileAsync('id', [flag, user]);
  const value = Number(stdout.trim());
  if (!Number.isInteger(value) || value <= 0) throw new Error(`gate sandbox user ${user} resolved to ${stdout.trim()}`);
  return value;
}

// Null when unconfigured; throws rather than silently staying root.
export async function resolveGateSandbox(
  user = process.env.GATE_SANDBOX_USER?.trim(),
  log: (message: string) => void = (message) => console.warn(message),
): Promise<GateSandbox | null> {
  if (!user) return null;
  if (process.getuid?.() !== 0) {
    throw new Error(`GATE_SANDBOX_USER=${user} needs the runner to start as root, to drop to that user`);
  }
  const uid = await idOf(user, '-u');
  const gid = await idOf(user, '-g');
  const home = await mkdtemp(path.join(tmpdir(), 'gate-home-'));
  await execFileAsync('chown', ['-R', `${uid}:${gid}`, home]);

  return {
    user,
    uid,
    gid,
    home,
    async adopt(dir) {
      // -P: never follow a symlink out of the tree.
      await execFileAsync('chown', ['-R', '-P', `${uid}:${gid}`, dir]);
    },
    async reap() {
      return reapUid(uid);
    },
    async blockMetadata() {
      try {
        await execFileAsync('iptables', [
          '-I',
          'OUTPUT',
          '-m',
          'owner',
          '--uid-owner',
          String(uid),
          '-d',
          METADATA_ADDRESS,
          '-j',
          'REJECT',
        ]);
        return true;
      } catch (error) {
        log(
          `gate sandbox: could not block ${METADATA_ADDRESS} for ${user} ` +
            `(${error instanceof Error ? error.message.split('\n')[0] : String(error)}); ` +
            'the service account is reachable from candidate code, bounded by its IAM',
        );
        return false;
      }
    },
    async dispose() {
      await rm(home, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export async function reapUid(uid: number, procRoot = '/proc'): Promise<number> {
  let killed = 0;
  // Twice: catches children forked during the first pass.
  for (let pass = 0; pass < 2; pass++) {
    const entries = await readdir(procRoot).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const status = await readFile(path.join(procRoot, entry, 'status'), 'utf8').catch(() => '');
      const match = /^Uid:\s+(\d+)/m.exec(status);
      if (!match || Number(match[1]) !== uid) continue;
      // Zombie: already dead, only waiting on its parent.
      if (/^State:\s+Z/m.test(status)) continue;
      try {
        process.kill(Number(entry), 'SIGKILL');
        killed++;
      } catch {
        // Already gone.
      }
    }
  }
  return killed;
}

// Root reads this tree back; links could leak root-only files.
export async function stripLinks(root: string): Promise<string[]> {
  const removed: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const stat = await lstat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
        await rm(full, { force: true });
        removed.push(path.relative(root, full));
      } else if (stat.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        await walk(full);
      }
    }
  };
  await walk(root);
  return removed;
}

// Sandbox support depends on the build host, so probe once per run.
export async function probeChromeSandbox(
  sandbox: GateSandbox,
  chrome: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(chrome, ['--headless=new', '--dump-dom', 'about:blank'], {
      uid: sandbox.uid,
      gid: sandbox.gid,
      env: { ...env, GATE_CHROME_NO_SANDBOX: '' },
      cwd: sandbox.home,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const ok = code === 0 && output.includes('<html');
      if (!ok) console.warn(`chrome sandbox probe failed (exit ${code}):\n${output.slice(-1500)}`);
      resolve(ok);
    });
  });
}

export type HarnessRun = (
  command: string,
  args: string[],
  cwd: string,
  options?: { onChunk?: (text: string) => void; env?: NodeJS.ProcessEnv; uid?: number; gid?: number },
) => Promise<{ code: number; output: string }>;

// Wraps `run` for harness commands. `harnesses` is read at call time.
export async function createHarnessRunner(
  run: HarnessRun,
  harnesses: readonly string[],
): Promise<{ sandbox: GateSandbox | null; runInHarness: HarnessRun }> {
  const sandbox = await resolveGateSandbox();
  const harnessEnv = scrubbedEnv(
    process.env,
    sandbox ? { HOME: sandbox.home, USER: sandbox.user, LOGNAME: sandbox.user } : {},
  );
  const chrome = process.env.GAME_CAPTURE_CHROME?.trim();
  if (sandbox) {
    await sandbox.blockMetadata();
    if (chrome) {
      const sandboxed = await probeChromeSandbox(sandbox, chrome, harnessEnv);
      if (!sandboxed && process.env.GATE_REQUIRE_CHROME_SANDBOX === '1') {
        throw new Error('chrome cannot start with its sandbox here and GATE_REQUIRE_CHROME_SANDBOX=1');
      }
      if (!sandboxed) harnessEnv.GATE_CHROME_NO_SANDBOX = '1';
      console.log(`gate sandbox: running as ${sandbox.user}, chrome sandbox ${sandboxed ? 'on' : 'OFF'}`);
    }
  }

  const runInHarness: HarnessRun = async (command, args, cwd, options) => {
    const result = await run(command, args, cwd, {
      ...options,
      env: harnessEnv,
      ...(sandbox ? { uid: sandbox.uid, gid: sandbox.gid } : {}),
    });
    if (sandbox) {
      // Nothing outlives it; no links survive for root-side reads.
      await sandbox.reap();
      for (const harness of harnesses) {
        const removed = await stripLinks(harness);
        if (removed.length) console.warn(`gate sandbox: removed links from the harness: ${removed.join(', ')}`);
      }
    }
    return result;
  };
  return { sandbox, runInHarness };
}
