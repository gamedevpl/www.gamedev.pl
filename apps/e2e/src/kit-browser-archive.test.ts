import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { verifyKitArchive } from '../../api/scripts/verify-kit-browser.js';

it('rejects changed archive bytes before installing or executing the package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kit-archive-boundary-'));
  const tarball = path.join(root, 'changed.tgz');
  try {
    await writeFile(tarball, 'changed archive bytes');
    await expect(
      verifyKitArchive({
        tarball,
        tarballSha256: 'c'.repeat(64),
        engineRef: 'a'.repeat(40),
        consumerSha: 'b'.repeat(40),
        engineSourceRoot: root,
        executablePath: process.execPath,
      }),
    ).rejects.toThrow('Kit archive hash does not match');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
