import { createHash } from 'node:crypto';
import { unreconciledMessage } from './checkout.js';

export const GIT_REMOTE_CAPS = ['import', 'push', 'option'] as const;

export type VersionRef = { version: string; createdAt: string };
export type TreeFile = { path: string; content: string };

export function shaForVersion(version: string): string {
  return createHash('sha1').update(`gamedev:${version}`).digest('hex');
}

export function refuseNonFastForward(): string {
  return `error ${unreconciledMessage()}`;
}

export function remoteSlugFromArgv(argv: string[]): string {
  const url = argv[3] ?? argv[2] ?? '';
  return url.replace(/^gamedev:\/\//, '').replace(/\/$/, '');
}

export function handleHelperLine(line: string, slug: string): string[] {
  const [cmd] = line.trim().split(' ');
  if (cmd === 'capabilities') return ['import', 'push', 'option', ''];
  if (cmd === 'list') return ['? HEAD', '? refs/heads/main', ''];
  if (cmd === 'option') return ['ok'];
  if (!cmd) return [];
  return [`error ${slug}: unknown helper command ${cmd}`];
}

export function listRefs(versions: VersionRef[]): string[] {
  const chronological = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const head = chronological.at(-1);
  if (!head) return ['@refs/heads/main HEAD', ''];
  const sha = shaForVersion(head.version);
  return [`${sha} HEAD`, `${sha} refs/heads/main`, ''];
}

export function fastImportScript(input: {
  slug: string;
  versions: VersionRef[];
  trees: Map<string, TreeFile[]>;
}): string {
  const chronological = [...input.versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const chunks: string[] = [];
  let mark = 1;
  for (const row of chronological) {
    const files = input.trees.get(row.version) ?? [];
    const message = row.version;
    chunks.push('commit refs/heads/main');
    chunks.push(`mark :${mark}`);
    chunks.push(`committer gamedev <cli@gamedev.pl> ${Math.floor(Date.parse(row.createdAt) / 1000)} +0000`);
    chunks.push(`data ${Buffer.byteLength(message)}`);
    chunks.push(message);
    if (mark > 1) chunks.push(`from :${mark - 1}`);
    chunks.push('deleteall');
    for (const file of files) {
      const rel = `games/${input.slug}/${file.path}`;
      const bytes = Buffer.byteLength(file.content);
      chunks.push(`M 100644 inline ${rel}`);
      chunks.push(`data ${bytes}`);
      chunks.push(file.content);
    }
    mark += 1;
  }
  chunks.push('done');
  return chunks.join('\n');
}

export type HelperIo = {
  readLine: () => Promise<string | null>;
  write: (line: string) => void;
  fetchVersions: (slug: string) => Promise<VersionRef[]>;
  fetchTree: (slug: string, version: string) => Promise<TreeFile[]>;
  importScript: (script: string) => Promise<void>;
  pushReconcile: () => Promise<'ok' | 'unreconciled'>;
};

export async function runRemoteHelper(slug: string, io: HelperIo): Promise<void> {
  const pendingImport = { want: false };
  for (;;) {
    const line = await io.readLine();
    if (line === null) return;
    const trimmed = line.trim();
    if (!trimmed) {
      if (!pendingImport.want) continue;
      const versions = await io.fetchVersions(slug);
      const trees = new Map<string, TreeFile[]>();
      for (const row of versions) {
        trees.set(row.version, await io.fetchTree(slug, row.version));
      }
      await io.importScript(fastImportScript({ slug, versions, trees }));
      pendingImport.want = false;
      continue;
    }
    const [cmd, ...rest] = trimmed.split(' ');
    if (cmd === 'capabilities') io.write('import\npush\noption\n\n');
    else if (cmd === 'list') {
      const versions = await io.fetchVersions(slug);
      io.write(`${listRefs(versions).join('\n')}\n`);
    } else if (cmd === 'option') io.write('ok\n');
    else if (cmd === 'import' || cmd === 'fetch') pendingImport.want = true;
    else if (cmd === 'push') {
      const result = await io.pushReconcile();
      const dst = rest.join(' ').split(':')[1] ?? 'refs/heads/main';
      if (result === 'unreconciled') io.write(`${refuseNonFastForward()}\n\n`);
      else io.write(`ok ${dst}\n\n`);
    } else io.write(`${handleHelperLine(trimmed, slug).join('\n')}\n`);
  }
}
