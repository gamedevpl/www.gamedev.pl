import { createHash } from 'node:crypto';
import { unreconciledMessage } from './checkout.js';
import { fastImportScript, remoteImportRef, type VersionRef, type TreeFile } from './git-history-import.js';
import { versionImportRef } from './git-history-import.js';
export { fastImportScript, remoteImportRef } from './git-history-import.js';
export type { VersionRef, TreeFile } from './git-history-import.js';

export const GIT_REMOTE_CAPS = ['import', 'push', 'option', 'refspec'] as const;

export function shaForVersion(version: string): string {
  return createHash('sha1').update(`gamedevpl:${version}`).digest('hex');
}

export function refuseNonFastForward(): string {
  return `error ${unreconciledMessage()}`;
}

export function handleHelperLine(line: string, slug: string, scope?: string): string[] {
  const [cmd] = line.trim().split(' ');
  if (cmd === 'capabilities')
    return ['import', 'push', 'option', `refspec refs/heads/main:${remoteImportRef(slug, scope)}`, ''];
  if (cmd === 'list') return ['@refs/heads/main HEAD', '? refs/heads/main', ''];
  if (cmd === 'option') return ['ok'];
  if (!cmd) return [];
  return [`error ${slug}: unknown helper command ${cmd}`];
}

export function listRefs(versions: VersionRef[]): string[] {
  return versions.length ? ['@refs/heads/main HEAD', '? refs/heads/main', ''] : [''];
}

export type PushResult = { ok: true } | { ok: false; message: string };

export type HelperIo = {
  readLine: () => Promise<string | null>;
  write: (line: string) => void;
  fetchVersions: (slug: string) => Promise<VersionRef[]>;
  fetchTree: (slug: string, version: string) => Promise<TreeFile[]>;
  importScript: (script: Buffer) => Promise<void>;
  knownCommits?: () => Map<string, string>;
  scope?: string;
  pushReconcile: (src: string) => Promise<PushResult>;
  sourceRoot?: string;
};

export function pushSrcRef(rest: string[]): string | null {
  const src = rest.join(' ').split(':')[0]?.trim() ?? '';
  return src || null;
}

export function pushDstRef(rest: string[]): string {
  return rest.join(' ').split(':')[1]?.trim() || 'refs/heads/main';
}

export function formatPushStatus(dst: string, result: PushResult): string {
  if (result.ok) return `ok ${dst}`;
  const why = result.message.replace(/[\r\n]+/g, ' ').trim() || 'push failed';
  return `error ${dst} ${why}`;
}

export async function runRemoteHelper(slug: string, io: HelperIo): Promise<void> {
  const pendingImport = { want: false };
  let listedVersions: VersionRef[] | undefined;
  for (;;) {
    const line = await io.readLine();
    if (line === null) return;
    const trimmed = line.trim();
    if (!trimmed) {
      if (!pendingImport.want) continue;
      const versions = listedVersions ?? (await io.fetchVersions(slug));
      const knownCommits = io.knownCommits?.();
      let parent: string | undefined;
      let markOffset = 0;
      const chronological = [...versions].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.version.localeCompare(b.version),
      );
      for (const row of chronological) {
        const known = knownCommits?.get(row.version);
        if (known) {
          parent = known;
          continue;
        }
        const files = await io.fetchTree(slug, row.version);
        await io.importScript(
          fastImportScript({
            slug,
            versions: [row],
            trees: new Map([[row.version, files]]),
            scope: io.scope,
            parent,
            markOffset,
            finish: false,
            sourceRoot: io.sourceRoot,
          }),
        );
        markOffset++;
        parent = versionImportRef(slug, row.version, io.scope);
      }
      await io.importScript(
        Buffer.from((parent ? `reset ${remoteImportRef(slug, io.scope)}\nfrom ${parent}\n\n` : '') + 'done\n'),
      );
      listedVersions = undefined;
      pendingImport.want = false;
      continue;
    }
    const [cmd, ...rest] = trimmed.split(' ');
    if (cmd === 'capabilities') io.write(`${handleHelperLine(trimmed, slug, io.scope).join('\n')}\n`);
    else if (cmd === 'list') {
      const versions = await io.fetchVersions(slug);
      listedVersions = versions;
      io.write(`${listRefs(versions).join('\n')}\n`);
    } else if (cmd === 'option') io.write('ok\n');
    else if (cmd === 'import' || cmd === 'fetch') pendingImport.want = true;
    else if (cmd === 'push') {
      const src = pushSrcRef(rest);
      const dst = pushDstRef(rest);
      if (!src) {
        io.write(`${formatPushStatus(dst, { ok: false, message: 'missing source ref' })}\n\n`);
        continue;
      }
      const result = await io.pushReconcile(src);
      io.write(`${formatPushStatus(dst, result)}\n\n`);
    } else io.write(`${handleHelperLine(trimmed, slug).join('\n')}\n`);
  }
}
