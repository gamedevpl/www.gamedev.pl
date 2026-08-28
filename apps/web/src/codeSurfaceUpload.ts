import {
  decodeTextBytes,
  deliverablePathReason,
  indexHtmlWriteReason,
  joinSourcePath,
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

function stripSharedRoot(paths: string[]): ((path: string) => string) | null {
  if (paths.length === 0) return null;
  const firstSegments = new Set(paths.map((path) => path.split('/')[0] ?? path));
  if (firstSegments.size !== 1) return null;
  const root = [...firstSegments][0]!;
  if (!paths.every((path) => path === root || path.startsWith(`${root}/`))) return null;
  if (paths.some((path) => path === root)) return null;
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
    const stripped = strip ? strip(relative) : relative;
    const path = joinSourcePath(into, stripped);
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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeTextBytes(bytes);
  if (content === null) return { path, reason: 'binary or too large' };
  return { relativePath: path, content };
}

export function uploadIsDestructive(plan: PlannedUpload): boolean {
  return plan.overwrite.length > 0;
}

export function uploadHasWork(plan: PlannedUpload): boolean {
  return plan.add.length + plan.overwrite.length > 0;
}
