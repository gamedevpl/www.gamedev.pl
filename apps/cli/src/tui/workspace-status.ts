import { isDeliverablePath } from '@gamedevpl/contract';
import { localGameFiles } from '../checkout.js';
import { hashesOf, readBase } from '../checkout-sync.js';

export type WorkspaceCheckout = { root: string; slug: string };
export type WorkspaceChanges = {
  kind: 'ready' | 'no_checkout' | 'no_base' | 'unavailable';
  version?: string;
  files: Array<{ path: string; kind: 'added' | 'modified' | 'deleted' }>;
};

export function readWorkspaceChanges(checkout: WorkspaceCheckout | null): WorkspaceChanges {
  if (!checkout) return { kind: 'no_checkout', files: [] };
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(checkout.slug)) return { kind: 'unavailable', files: [] };
  try {
    const base = readBase(checkout.root);
    if (!base) return { kind: 'no_base', files: [] };
    const local = hashesOf(localGameFiles(checkout.root, checkout.slug));
    const names = [...new Set([...Object.keys(base.files), ...Object.keys(local)])].sort();
    return {
      kind: 'ready',
      version: base.version,
      files: names
        .filter((path) => isDeliverablePath(path) && base.files[path] !== local[path])
        .map((path) => ({
          path,
          kind: !(path in local) ? 'deleted' : !(path in base.files) ? 'added' : 'modified',
        })),
    };
  } catch {
    return { kind: 'unavailable', files: [] };
  }
}
