type FileSystemFileEntryLike = {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (ok: (file: File) => void, err?: (error: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => {
    readEntries: (
      ok: (entries: Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike>) => void,
      err?: (error: DOMException) => void,
    ) => void;
  };
};

type FileSystemEntryLike = FileSystemFileEntryLike | FileSystemDirectoryEntryLike;

function asEntry(item: DataTransferItem): FileSystemEntryLike | null {
  const candidate = item as DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntry | null;
  };
  return (candidate.webkitGetAsEntry?.() as FileSystemEntryLike | null | undefined) ?? null;
}

async function readAllEntries(
  reader: FileSystemDirectoryEntryLike['createReader'] extends () => infer R ? R : never,
): Promise<Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike>> {
  const all: Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike> = [];
  for (;;) {
    const batch = await new Promise<Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike>>(
      (resolve, reject) => {
        reader.readEntries(resolve, reject);
      },
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    Object.defineProperty(file, 'webkitRelativePath', { value: relative, configurable: true });
    return [file];
  }
  const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
  const children = await readAllEntries(entry.createReader());
  const nested = await Promise.all(children.map((child) => walkEntry(child, nextPrefix)));
  return nested.flat();
}

export async function filesFromDataTransfer(data: DataTransfer): Promise<File[]> {
  const items = [...data.items].filter((item) => item.kind === 'file');
  const entries = items.map(asEntry);
  if (entries.some((entry) => entry !== null)) {
    const walked = await Promise.all(
      entries.filter((entry): entry is FileSystemEntryLike => entry !== null).map((entry) => walkEntry(entry, '')),
    );
    return walked.flat();
  }
  return [...data.files];
}

export function isArchiveFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
}
