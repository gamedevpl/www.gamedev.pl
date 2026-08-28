import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { unpackArchive } from './codeSurfaceArchive.js';
import { fetchCodeSurfaceSources, type CodeSurfaceFile, type CodeSurfaceSources } from './codeSurfaceApi.js';
import { filesFromDataTransfer, isArchiveFileName } from './codeSurfaceDrop.js';
import {
  deliverablePathReason,
  folderPathReason,
  isUnderPrefix,
  joinSourcePath,
  normalizeSourcePath,
  parentDir,
  stubForPath,
  wouldNestInsideSelf,
} from './codeSurfacePaths.js';
import { applyTreeMutation } from './codeSurfaceTreeApply.js';
import {
  defaultFolderForSelection,
  filesUnderPrefix,
  planFolderMove,
  pruneEmptyFolders,
} from './codeSurfaceTreeModel.js';
import {
  planSourceUpload,
  readFileAsUploadEntry,
  uploadHasWork,
  type PlannedUpload,
  type SkippedUpload,
  type UploadEntry,
} from './codeSurfaceUpload.js';
import { recordCodeStep } from './visitTelemetry.js';
import type { TreeConfirm, TreePrompt } from './CodeSurfaceTreeDialogs.js';

export type UseCodeSurfaceTreeOptions = {
  slug: string;
  files: CodeSurfaceFile[];
  drafts: Record<string, string>;
  selected: string | null;
  editable: boolean;
  prepareMutation: (paths: string[]) => Promise<void>;
  onSources: (sources: CodeSurfaceSources) => void;
  onDrafts: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  onSelect: (path: string | null) => void;
  onError: (message: string) => void;
  onRebuild: () => void;
  onDiscard: () => Promise<void>;
  onTsUpdate?: (path: string, content: string) => void;
};

async function collectEntries(items: Array<{ file: File; relative?: string }>) {
  const entries: UploadEntry[] = [];
  const skipped: SkippedUpload[] = [];
  for (const item of items) {
    const read = await readFileAsUploadEntry(item.file, item.relative);
    if ('reason' in read) skipped.push(read);
    else entries.push(read);
  }
  return { entries, skipped };
}

export function useCodeSurfaceTree(options: UseCodeSurfaceTreeOptions) {
  const { t } = useTranslation();
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusedFolder, setFocusedFolder] = useState('');
  const [confirm, setConfirm] = useState<TreeConfirm | null>(null);
  const [prompt, setPrompt] = useState<TreePrompt | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragItem, setDragItem] = useState<{ path: string; kind: 'file' | 'folder' } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const archiveRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(options.files);
  filesRef.current = options.files;
  const draftsRef = useRef(options.drafts);
  draftsRef.current = options.drafts;

  const paths = useMemo(() => options.files.map((file) => file.path), [options.files]);
  const existing = useMemo(() => new Set(paths), [paths]);

  useEffect(() => {
    setEmptyFolders((current) => {
      const next = pruneEmptyFolders(
        current,
        filesRef.current.map((file) => file.path),
      );
      const same = next.length === current.length && next.every((folder, i) => folder === current[i]);
      return same ? current : next;
    });
  }, [options.files]);

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      let changed = false;
      for (const file of options.files) {
        let dir = parentDir(file.path);
        while (dir) {
          if (!next.has(dir)) {
            next.add(dir);
            changed = true;
          }
          dir = parentDir(dir);
        }
      }
      return changed ? next : current;
    });
  }, [options.files]);

  const contentOf = useCallback((path: string) => {
    return draftsRef.current[path] ?? filesRef.current.find((file) => file.path === path)?.content ?? '';
  }, []);

  const targetFolder = useCallback(
    () => defaultFolderForSelection(options.selected, focusedFolder),
    [focusedFolder, options.selected],
  );

  const refresh = useCallback(
    async (selectPath: string | null | undefined, removed: string[]) => {
      const result = await fetchCodeSurfaceSources(options.slug);
      options.onSources(result);
      const remaining = result.files.map((file) => file.path);
      if (selectPath) options.onSelect(selectPath);
      else if (options.selected && removed.includes(options.selected)) {
        options.onSelect(remaining[0] ?? null);
      }
      options.onRebuild();
    },
    [options],
  );

  const runMutation = useCallback(
    async (writes: Array<{ path: string; content: string }>, deletes: string[], selectPath?: string | null) => {
      setBusy(true);
      try {
        await options.prepareMutation([...writes.map((file) => file.path), ...deletes]);
        await applyTreeMutation({ slug: options.slug, writes, deletes });
        options.onDrafts((current) => {
          const next = { ...current };
          for (const path of deletes) delete next[path];
          for (const file of writes) next[file.path] = file.content;
          return next;
        });
        for (const file of writes) {
          if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) options.onTsUpdate?.(file.path, file.content);
        }
        await refresh(selectPath, deletes);
      } catch (error) {
        options.onError(error instanceof Error ? error.message : t('studioPanel.code.tree.error'));
      } finally {
        setBusy(false);
        setConfirm(null);
        setPrompt(null);
      }
    },
    [options, refresh, t],
  );

  const openUploadConfirm = useCallback(
    (plan: PlannedUpload) => {
      if (!uploadHasWork(plan)) {
        options.onError(t('studioPanel.code.tree.nothingToAdd'));
        return;
      }
      setConfirm({ kind: 'upload', plan });
    },
    [options, t],
  );

  const ingestFiles = useCallback(
    async (fileList: File[], intoFolder: string, stripRoot: boolean) => {
      let items = fileList.map((file) => ({ file }));
      let strip = stripRoot;
      if (fileList.length === 1 && isArchiveFileName(fileList[0]!.name)) {
        try {
          const unpacked = await unpackArchive(new Uint8Array(await fileList[0]!.arrayBuffer()), fileList[0]!.name);
          items = unpacked.map((entry) => ({ file: new File([entry.bytes], entry.path), relative: entry.path }));
          strip = true;
        } catch (error) {
          options.onError(error instanceof Error ? error.message : t('studioPanel.code.tree.noArchive'));
          return;
        }
      }
      const { entries, skipped } = await collectEntries(items);
      const plan = planSourceUpload({ entries, existing, intoFolder, stripRoot: strip });
      openUploadConfirm({ ...plan, skipped: [...skipped, ...plan.skipped] });
    },
    [existing, openUploadConfirm, options, t],
  );

  function closeDialogs() {
    if (busy) return;
    setConfirm(null);
    setPrompt(null);
  }

  function requestNewFile() {
    const folder = targetFolder();
    const value = folder ? `${folder}/` : '';
    setPrompt({ kind: 'new-file', folder, value, exists: false });
    setPromptValue(value);
  }

  function requestNewFolder() {
    const folder = targetFolder();
    setPrompt({ kind: 'new-folder', folder, value: '' });
    setPromptValue('');
  }

  function requestMove(path: string, kind: 'move-file' | 'move-folder') {
    setPrompt({ kind, from: path, value: path });
    setPromptValue(path);
  }

  function requestDeleteFile(path: string) {
    setConfirm({ kind: 'delete-file', path });
  }

  function requestDeleteFolder(path: string) {
    const files = filesUnderPrefix(paths, path);
    if (files.length === 0) setConfirm({ kind: 'delete-empty-folder', path });
    else setConfirm({ kind: 'delete-folder', path, files });
  }

  function askFolderMove(from: string, to: string) {
    if (wouldNestInsideSelf(from, to)) {
      options.onError(t('studioPanel.code.tree.invalidName'));
      return;
    }
    const pairs = planFolderMove(paths, from, to);
    setConfirm({
      kind: 'move-folder',
      from,
      to,
      count: pairs.length,
      overwrite: pairs.filter((pair) => existing.has(pair.to) && !isUnderPrefix(pair.to, from)).map((pair) => pair.to),
    });
  }

  function onPromptValue(value: string) {
    setPromptValue(value);
    setPrompt((current) => {
      if (!current || current.kind !== 'new-file') return current;
      const path = normalizeSourcePath(value);
      return { ...current, value, exists: existing.has(path) };
    });
  }

  function submitPrompt() {
    if (!prompt) return;
    const value = normalizeSourcePath(promptValue);
    if (prompt.kind === 'new-file') {
      const reason = deliverablePathReason(value);
      if (reason) {
        options.onError(reason);
        return;
      }
      if (existing.has(value)) {
        options.onError(t('studioPanel.code.tree.exists'));
        return;
      }
      void runMutation([{ path: value, content: stubForPath(value) }], [], value);
      recordCodeStep('file_created');
      return;
    }
    if (prompt.kind === 'new-folder') {
      const path = joinSourcePath(prompt.folder, value);
      const reason = folderPathReason(path);
      if (reason) {
        options.onError(reason);
        return;
      }
      setEmptyFolders((current) => (current.includes(path) ? current : [...current, path]));
      setExpanded((current) => new Set([...current, path]));
      setFocusedFolder(path);
      setPrompt(null);
      recordCodeStep('file_created');
      return;
    }
    if (prompt.kind === 'move-file') {
      if (!value || value === prompt.from) {
        setPrompt(null);
        return;
      }
      const reason = deliverablePathReason(value);
      if (reason) {
        options.onError(reason);
        return;
      }
      setPrompt(null);
      setConfirm({ kind: 'move-file', from: prompt.from, to: value, overwrite: existing.has(value) });
      return;
    }
    if (!value || value === prompt.from) {
      setPrompt(null);
      return;
    }
    const reason = folderPathReason(value);
    if (reason) {
      options.onError(reason);
      return;
    }
    setPrompt(null);
    askFolderMove(prompt.from, value);
  }

  async function confirmAction() {
    if (!confirm) return;
    if (confirm.kind === 'discard') {
      setBusy(true);
      try {
        await options.onDiscard();
        setEmptyFolders([]);
        setConfirm(null);
      } catch (error) {
        options.onError(error instanceof Error ? error.message : t('studioPanel.code.discardError'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (confirm.kind === 'delete-file') {
      recordCodeStep('file_deleted');
      await runMutation([], [confirm.path]);
      return;
    }
    if (confirm.kind === 'delete-empty-folder') {
      setEmptyFolders((current) => current.filter((folder) => folder !== confirm.path));
      if (focusedFolder === confirm.path) setFocusedFolder('');
      setConfirm(null);
      return;
    }
    if (confirm.kind === 'delete-folder') {
      recordCodeStep('file_deleted');
      setEmptyFolders((current) =>
        current.filter((folder) => folder !== confirm.path && !folder.startsWith(`${confirm.path}/`)),
      );
      await runMutation([], confirm.files);
      return;
    }
    if (confirm.kind === 'move-file') {
      recordCodeStep('file_moved');
      await runMutation([{ path: confirm.to, content: contentOf(confirm.from) }], [confirm.from], confirm.to);
      return;
    }
    if (confirm.kind === 'move-folder') {
      const pairs = planFolderMove(paths, confirm.from, confirm.to);
      recordCodeStep('file_moved');
      setEmptyFolders((current) =>
        current.map((folder) =>
          folder === confirm.from || folder.startsWith(`${confirm.from}/`)
            ? folder.replace(confirm.from, confirm.to)
            : folder,
        ),
      );
      await runMutation(
        pairs.map((pair) => ({ path: pair.to, content: contentOf(pair.from) })),
        pairs.map((pair) => pair.from),
        options.selected ? pairs.find((pair) => pair.from === options.selected)?.to : undefined,
      );
      return;
    }
    recordCodeStep('files_uploaded');
    const writes = [...confirm.plan.add, ...confirm.plan.overwrite];
    await runMutation(writes, [], writes[0]?.path);
  }

  function onInternalDrop(toFolder: string) {
    if (!dragItem) return;
    const to = joinSourcePath(toFolder, dragItem.path.split('/').pop() ?? dragItem.path);
    if (dragItem.kind === 'file') {
      if (to === dragItem.path) return;
      const reason = deliverablePathReason(to);
      if (reason) {
        options.onError(reason);
        return;
      }
      setConfirm({ kind: 'move-file', from: dragItem.path, to, overwrite: existing.has(to) });
      return;
    }
    askFolderMove(dragItem.path, to);
  }

  async function dropAt(folder: string, event: DragEvent<HTMLElement>, filesInto = folder) {
    if (event.dataTransfer?.types.includes('Files') && event.dataTransfer.files.length > 0 && !dragItem) {
      await ingestFiles(await filesFromDataTransfer(event.dataTransfer), filesInto, false);
    } else {
      onInternalDrop(folder);
      setDragItem(null);
    }
    setDropTarget(null);
  }

  async function onInputFiles(event: ChangeEvent<HTMLInputElement>, stripRoot: boolean, into = targetFolder()) {
    const list = [...(event.target.files ?? [])];
    event.target.value = '';
    await ingestFiles(list, into, stripRoot);
  }

  const treeProps = {
    files: options.files,
    emptyFolders,
    selected: options.selected,
    focusedFolder,
    expanded,
    editable: options.editable,
    busy,
    dropTarget,
    onSelectFile: options.onSelect,
    onFocusFolder: setFocusedFolder,
    onToggleFolder: (path: string) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    onNewFile: requestNewFile,
    onNewFolder: requestNewFolder,
    onUploadFiles: () => fileRef.current?.click(),
    onUploadFolder: () => folderRef.current?.click(),
    onUploadArchive: () => archiveRef.current?.click(),
    onDeleteFile: requestDeleteFile,
    onDeleteFolder: requestDeleteFolder,
    onMoveFile: (path: string) => requestMove(path, 'move-file'),
    onMoveFolder: (path: string) => requestMove(path, 'move-folder'),
    onDragStart: (path: string, kind: 'file' | 'folder') => setDragItem({ path, kind }),
    onDragOverFolder: setDropTarget,
    onDropOnFolder: (path: string, event: DragEvent<HTMLElement>) => void dropAt(path, event),
    onDragEnd: () => {
      setDragItem(null);
      setDropTarget(null);
    },
    onRootDrop: (event: DragEvent<HTMLElement>) => void dropAt('', event, targetFolder()),
    onRootDragOver: () => setDropTarget(''),
  };

  const inputProps = {
    fileRef,
    folderRef,
    archiveRef,
    onFiles: (event: ChangeEvent<HTMLInputElement>) => void onInputFiles(event, false),
    onFolder: (event: ChangeEvent<HTMLInputElement>) => void onInputFiles(event, false),
    onArchive: (event: ChangeEvent<HTMLInputElement>) => void onInputFiles(event, true, targetFolder()),
  };

  return {
    treeProps,
    inputProps,
    dialogProps: {
      confirm,
      prompt,
      promptValue,
      busy,
      onPromptValue,
      onCancel: closeDialogs,
      onConfirm: () => void confirmAction(),
      onSubmitPrompt: submitPrompt,
    },
    requestDiscard: () => setConfirm({ kind: 'discard' }),
    busy,
  };
}
