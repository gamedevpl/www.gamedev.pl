import { PLATFORM_HANDLE, RESERVED_HANDLES } from './creator-profile.js';
import {
  CREATOR_ALIAS_PATTERN,
  ROOT_CREATOR_PATTERN,
  STATUS_PATTERN,
  STUDIO_PATTERN,
  normalizePathname,
} from './spa-paths.js';

// The handle a profile path names; null for the platform.
export function creatorHandleFromPath(urlOrPath: string): string | null {
  const pathname = normalizePathname(urlOrPath);
  const handle = pathname.match(CREATOR_ALIAS_PATTERN)?.[1] ?? pathname.match(ROOT_CREATOR_PATTERN)?.[1];
  if (!handle || handle === PLATFORM_HANDLE || RESERVED_HANDLES.has(handle)) return null;
  return handle;
}

// Private creator workspaces: served, never indexed.
export function isPrivateWorkspacePath(urlOrPath: string): boolean {
  const pathname = normalizePathname(urlOrPath);
  return STUDIO_PATTERN.test(pathname) || STATUS_PATTERN.test(pathname);
}
