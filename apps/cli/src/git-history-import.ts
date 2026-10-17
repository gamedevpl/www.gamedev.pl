import type { HistorySourceFile } from '@gamedevpl/contract';
import { historySlug } from './history-api.js';

export type VersionRef = { version: string; createdAt: string; sourceFiles?: string[] };
export type TreeFile = HistorySourceFile;
export const remoteImportRef = (slug: string, scope?: string): string =>
  `refs/gamedevpl/${scope ? `${scope}/` : ''}${historySlug(slug)}/main`;
export const versionImportRef = (slug: string, version: string, scope?: string): string =>
  `${remoteImportRef(slug, scope).slice(0, -4)}versions/${Buffer.from(version).toString('hex')}`;

export function sourceBytes(file: TreeFile): Buffer {
  return Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
}

export function fastImportScript(input: {
  slug: string;
  versions: VersionRef[];
  trees: Map<string, TreeFile[]>;
  ref?: string;
  knownCommits?: Map<string, string>;
  scope?: string;
  parent?: string;
  markOffset?: number;
  finish?: boolean;
  sourceRoot?: string;
  preserveOutsideSources?: boolean;
  parentSourceFiles?: string[];
}): Buffer {
  historySlug(input.slug);
  const ref = input.ref ?? remoteImportRef(input.slug, input.scope);
  const sourceRoot = input.sourceRoot ?? `games/${input.slug}`;
  if (!['src', `games/${input.slug}`].includes(sourceRoot)) throw new Error('invalid Git source root');
  const chronological = [...input.versions].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.version.localeCompare(b.version),
  );
  const chunks: Buffer[] = [];
  const emit = (text: string) => chunks.push(Buffer.from(text + '\n'));
  let parent = input.parent;
  let previousFiles = input.parentSourceFiles ?? [];
  let mark = input.markOffset ?? 0;
  for (const row of chronological) {
    const known = input.knownCommits?.get(row.version);
    if (known) {
      parent = known;
      previousFiles = row.sourceFiles ?? [];
      continue;
    }
    const files = input.trees.get(row.version);
    if (!files) throw new Error(`missing source tree for ${row.version}`);
    const date = Math.floor(Date.parse(row.createdAt) / 1000);
    if (!Number.isFinite(date)) throw new Error(`invalid version date for ${row.version}`);
    if (!parent) {
      emit(`reset ${ref}`);
      emit('');
    }
    emit(`commit ${ref}`);
    emit(`mark :${++mark}`);
    emit(`committer gamedevpl <cli@gamedev.pl> ${date} +0000`);
    emit(`data ${Buffer.byteLength(row.version)}`);
    emit(row.version);
    if (parent) emit(`from ${parent}`);
    if (input.preserveOutsideSources) {
      for (const path of previousFiles) {
        if (
          !path ||
          path.includes('\\') ||
          path.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')
        )
          throw new Error('invalid previous Git source path');
        emit(`D ${JSON.stringify(`${sourceRoot}/${path}`)}`);
      }
    } else emit('deleteall');
    for (const file of files) {
      if (
        !file.path ||
        file.path.includes('\\') ||
        [...file.path].some((char) => char.charCodeAt(0) < 32) ||
        file.path.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')
      )
        throw new Error('invalid version source path');
      const bytes = sourceBytes(file);
      emit(`M 100644 inline ${JSON.stringify(`${sourceRoot}/${file.path}`)}`);
      emit(`data ${bytes.length}`);
      chunks.push(bytes, Buffer.from('\n'));
    }
    parent = `:${mark}`;
    previousFiles = files.map((file) => file.path);
    emit(`reset ${versionImportRef(input.slug, row.version, input.scope)}`);
    emit(`from ${parent}`);
    emit('');
  }
  if (chronological.length) {
    emit(`reset ${ref}`);
    emit(`from ${parent}`);
    emit('');
  }
  if (input.finish !== false) emit('done');
  return Buffer.concat(chunks);
}
