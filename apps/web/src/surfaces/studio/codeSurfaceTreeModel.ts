import { baseName, isUnderPrefix, joinSourcePath, normalizeSourcePath, parentDir } from './codeSurfacePaths.js';

export type TreeFile = { path: string; stagedBy?: 'agent' | 'owner' };

export type TreeFileNode = {
  kind: 'file';
  name: string;
  path: string;
  stagedBy?: 'agent' | 'owner';
};

export type TreeFolderNode = {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
};

export type TreeNode = TreeFileNode | TreeFolderNode;

type MutableFolder = {
  kind: 'folder';
  name: string;
  path: string;
  children: Map<string, MutableFolder | TreeFileNode>;
};

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function freezeFolder(folder: MutableFolder): TreeFolderNode {
  const children: TreeNode[] = [];
  for (const child of folder.children.values()) {
    children.push(child.kind === 'folder' ? freezeFolder(child) : child);
  }
  return { kind: 'folder', name: folder.name, path: folder.path, children: sortNodes(children) };
}

function ensureFolder(root: MutableFolder, path: string): MutableFolder {
  const normalized = normalizeSourcePath(path);
  if (!normalized) return root;
  let current = root;
  const parts = normalized.split('/');
  let walked = '';
  for (const part of parts) {
    walked = walked ? `${walked}/${part}` : part;
    const existing = current.children.get(part);
    if (existing && existing.kind === 'folder') {
      current = existing;
      continue;
    }
    const created: MutableFolder = { kind: 'folder', name: part, path: walked, children: new Map() };
    current.children.set(part, created);
    current = created;
  }
  return current;
}

export function buildSourceTree(files: TreeFile[], emptyFolders: string[] = []): TreeNode[] {
  const root: MutableFolder = { kind: 'folder', name: '', path: '', children: new Map() };
  for (const folder of emptyFolders) ensureFolder(root, folder);
  for (const file of files) {
    const dir = parentDir(file.path);
    const parent = dir ? ensureFolder(root, dir) : root;
    const name = baseName(file.path);
    parent.children.set(name, { kind: 'file', name, path: file.path, stagedBy: file.stagedBy });
  }
  return freezeFolder(root).children;
}

export function filesUnderPrefix(paths: string[], prefix: string): string[] {
  return paths.filter((path) => isUnderPrefix(path, prefix)).sort();
}

export function movePathUnder(path: string, fromPrefix: string, toPrefix: string): string {
  const from = normalizeSourcePath(fromPrefix);
  const to = normalizeSourcePath(toPrefix);
  if (!from) return joinSourcePath(to, path);
  if (path === from) return to;
  if (!path.startsWith(`${from}/`)) return path;
  return joinSourcePath(to, path.slice(from.length + 1));
}

export function planFolderMove(
  paths: string[],
  fromPrefix: string,
  toPrefix: string,
): Array<{ from: string; to: string }> {
  return filesUnderPrefix(paths, fromPrefix).map((from) => ({
    from,
    to: movePathUnder(from, fromPrefix, toPrefix),
  }));
}

export function pruneEmptyFolders(emptyFolders: string[], filePaths: string[]): string[] {
  return emptyFolders.filter((folder) => {
    const normalized = normalizeSourcePath(folder);
    if (!normalized) return false;
    return !filePaths.some((path) => isUnderPrefix(path, normalized));
  });
}

export function defaultFolderForSelection(selected: string | null, focusedFolder: string): string {
  if (focusedFolder) return normalizeSourcePath(focusedFolder);
  if (!selected) return '';
  return parentDir(selected);
}
