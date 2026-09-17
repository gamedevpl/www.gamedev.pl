import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function acquireStartupLock(path: string, controllerPid?: number): () => void {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let owner = 'unknown (startup may have stopped before recording its owner)';
    try {
      const value = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8')) as { pid?: number };
      if (Number.isSafeInteger(value.pid) && value.pid! > 0) owner = String(value.pid);
    } catch {
      // Older or interrupted acquisitions may not have an owner record.
    }
    throw Error(
      `Play startup lock exists: ${path}. Launcher PID: ${owner}; previous controller PID: ${controllerPid ?? 'none'}. ` +
        'If startup is still running, wait and retry. For crash recovery, inspect the session journal and log ' +
        'and confirm the launcher, controller and child agent have all exited before removing this lock directory. ' +
        'Then rerun the same launch command. Never remove a live or unverified lock.',
      { cause: error },
    );
  }
  try {
    writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(path, { recursive: true, force: true });
}
