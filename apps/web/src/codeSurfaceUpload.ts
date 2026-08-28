import {
  decodeTextBytes,
  deliverablePathReason,
  FIXED_SOURCE_FILES,
  indexHtmlWriteReason,
  joinSourcePath,
  MAX_FILE_BYTES,
  normalizeSourcePath,
} from './codeSurfacePaths.js';

export type UploadEntry = { relativePath: string; content: string };

export type PlannedUploadFile = { path: string; content: string };

export type SkippedUpload = { path: string; reason: string };

export type PlannedUpload = {
  add: PlannedUploadFile[];
  overwrite: PlannedUploadFile[];
  skipped: SkippedUpload[];
};

export type UploadReadLimits = { maxEntryBytes: number; maxBytes: number; maxEntries: number };

export const DEFAULT_UPLOAD_READ_LIMITS: UploadReadLimits = {
  maxEntryBytes: MAX_FILE_BYTES,
  maxBytes: MAX_FILE_BYTES * 60,
  maxEntries: 60,
};

export type UploadItem = { file: File; relative?: string };

function itemRelativePath(item: UploadItem): string {
  return normalizeSourcePath(item.relative || item.file.webkitRelativePath || item.file.name);
}

function destForUpload(relative: string, into: string, strip: ((path: string) => string) | null): string {
  return joinSourcePath(into, strip ? strip(relative) : relative);
}

function stripSharedRoot(paths: string[]): ((path: string) => string) | null {
  if (paths.length === 0) return null;
  const firstSegments = new Set(paths.map((path) => path.split('/')[0] ?? path));
  if (firstSegments.size !== 1) return null;
  const root = [...firstSegments][0]!;
  if (!paths.every((path) => path === root || path.startsWith(`${root}/`))) return null;
  if (paths.some((path) => path === root)) return null;
  const stripped = paths.map((path) => path.slice(root.length + 1));
  if (!stripped.some((path) => (FIXED_SOURCE_FILES as readonly string[]).includes(path))) return null;
  return (path) => path.slice(root.length + 1);
}

export function planSourceUpload(options: {
  entries: UploadEntry[];
  existing: ReadonlySet<string>;
  intoFolder?: string;
  stripRoot?: boolean;
}): PlannedUpload {
  const into = normalizeSourcePath(options.intoFolder ?? '');
  const relativePaths = options.entries.map((entry) => normalizeSourcePath(entry.relativePath)).filter(Boolean);
  const strip = options.stripRoot === false ? null : stripSharedRoot(relativePaths);
  const add: PlannedUploadFile[] = [];
  const overwrite: PlannedUploadFile[] = [];
  const skipped: SkippedUpload[] = [];
  const seen = new Set<string>();

  for (const entry of options.entries) {
    const relative = normalizeSourcePath(entry.relativePath);
    if (!relative) {
      skipped.push({ path: entry.relativePath, reason: 'empty path' });
      continue;
    }
    const path = destForUpload(relative, into, strip);
    if (seen.has(path)) {
      skipped.push({ path, reason: 'duplicate path in this upload' });
      continue;
    }
    const illegal = deliverablePathReason(path) ?? indexHtmlWriteReason(path, entry.content);
    if (illegal) {
      skipped.push({ path, reason: illegal });
      continue;
    }
    seen.add(path);
    const file = { path, content: entry.content };
    if (options.existing.has(path)) overwrite.push(file);
    else add.push(file);
  }

  return { add, overwrite, skipped };
}

export async function readFileAsUploadEntry(file: File, relativePath?: string): Promise<UploadEntry | SkippedUpload> {
  const path = normalizeSourcePath(relativePath || file.webkitRelativePath || file.name);
  if (file.size > MAX_FILE_BYTES) return { path, reason: 'binary or too large' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeTextBytes(bytes);
  if (content === null) return { path, reason: 'binary or too large' };
  return { relativePath: path, content };
}

export async function collectUploadEntries(
  items: UploadItem[],
  options: { intoFolder?: string; stripRoot?: boolean; limits?: UploadReadLimits } = {},
): Promise<{ entries: UploadEntry[]; skipped: SkippedUpload[] }> {
  const limits = options.limits ?? DEFAULT_UPLOAD_READ_LIMITS;
  const into = normalizeSourcePath(options.intoFolder ?? '');
  const strip = options.stripRoot === false ? null : stripSharedRoot(items.map(itemRelativePath).filter(Boolean));
  const entries: UploadEntry[] = [];
  const skipped: SkippedUpload[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const item of items) {
    const relative = itemRelativePath(item);
    if (!relative) {
      skipped.push({ path: item.relative || item.file.name, reason: 'empty path' });
      continue;
    }
    const path = destForUpload(relative, into, strip);
    if (seen.has(path)) {
      skipped.push({ path, reason: 'duplicate path in this upload' });
      continue;
    }
    const illegal = deliverablePathReason(path);
    if (illegal) {
      skipped.push({ path, reason: illegal });
      continue;
    }
    if (item.file.size > limits.maxEntryBytes) {
      skipped.push({ path, reason: 'binary or too large' });
      continue;
    }
    if (entries.length >= limits.maxEntries) {
      skipped.push({ path, reason: 'too many files' });
      continue;
    }
    if (used + item.file.size > limits.maxBytes) {
      skipped.push({ path, reason: 'upload is too large' });
      continue;
    }
    seen.add(path);
    const read = await readFileAsUploadEntry(item.file, relative);
    if ('reason' in read) {
      skipped.push(read);
      continue;
    }
    used += item.file.size;
    entries.push(read);
  }
  return { entries, skipped };
}

export function uploadIsDestructive(plan: PlannedUpload): boolean {
  return plan.overwrite.length > 0;
}

export function uploadHasWork(plan: PlannedUpload): boolean {
  return plan.add.length + plan.overwrite.length > 0;
}
