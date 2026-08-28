import type { ChangeEvent, CSSProperties, DragEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeSurfaceFile } from './codeSurfaceApi.js';
import { buildSourceTree, type TreeNode } from './codeSurfaceTreeModel.js';
import { PixelIcon } from '../../PixelIcon.js';

const LOCKED_DIRS = ['shared/', 'tools/'] as const;

export type CodeSurfaceExplorerTreeProps = {
  variant: 'rail' | 'sheet';
  files: CodeSurfaceFile[];
  emptyFolders: string[];
  selected: string | null;
  focusedFolder: string;
  expanded: ReadonlySet<string>;
  editable: boolean;
  busy: boolean;
  dropTarget: string | null;
  onSelectFile: (path: string) => void;
  onFocusFolder: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onUploadArchive: () => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveFile: (path: string) => void;
  onMoveFolder: (path: string) => void;
  onDragStart: (path: string, kind: 'file' | 'folder') => void;
  onDragOverFolder: (path: string) => void;
  onDropOnFolder: (path: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onRootDrop: (event: DragEvent<HTMLElement>) => void;
  onRootDragOver: () => void;
};

function ToolButton(props: {
  label: string;
  icon: 'plus' | 'folder' | 'download' | 'code';
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="code-surface-tree-tool"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <PixelIcon name={props.icon} size={13} />
    </button>
  );
}

export function CodeSurfaceExplorerTree(props: CodeSurfaceExplorerTreeProps) {
  const { t } = useTranslation();
  const nodes = buildSourceTree(props.files, props.emptyFolders);

  return (
    <div
      className={`code-surface-tree is-${props.variant}`}
      onDragOver={(event) => {
        if (!props.editable) return;
        event.preventDefault();
        props.onRootDragOver();
      }}
      onDrop={(event) => {
        if (!props.editable) return;
        event.preventDefault();
        props.onRootDrop(event);
      }}
    >
      {props.editable ? (
        <div className="code-surface-tree-toolbar">
          <ToolButton
            label={t('studioPanel.code.tree.newFile')}
            icon="plus"
            disabled={props.busy}
            onClick={props.onNewFile}
          />
          <ToolButton
            label={t('studioPanel.code.tree.newFolder')}
            icon="folder"
            disabled={props.busy}
            onClick={props.onNewFolder}
          />
          <ToolButton
            label={t('studioPanel.code.tree.uploadFile')}
            icon="download"
            disabled={props.busy}
            onClick={props.onUploadFiles}
          />
          <ToolButton
            label={t('studioPanel.code.tree.uploadFolder')}
            icon="folder"
            disabled={props.busy}
            onClick={props.onUploadFolder}
          />
          <ToolButton
            label={t('studioPanel.code.tree.uploadArchive')}
            icon="code"
            disabled={props.busy}
            onClick={props.onUploadArchive}
          />
        </div>
      ) : null}
      <div className="code-surface-tree-rows" role={props.variant === 'sheet' ? 'listbox' : undefined}>
        {nodes.map((node) => (
          <TreeRows key={node.path} node={node} depth={0} {...props} />
        ))}
        {LOCKED_DIRS.map((dir) => (
          <div
            key={dir}
            className="code-surface-rail-locked code-surface-tree-locked"
            title={t('studioPanel.code.lockedHint')}
          >
            <PixelIcon name="lock" size={11} />
            <span>{dir}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeRows(props: CodeSurfaceExplorerTreeProps & { node: TreeNode; depth: number }) {
  if (props.node.kind === 'file') {
    return <FileRow {...props} node={props.node} />;
  }
  const expanded = props.expanded.has(props.node.path);
  return (
    <>
      <FolderRow {...props} node={props.node} open={expanded} />
      {expanded
        ? props.node.children.map((child) => (
            <TreeRows key={child.path} {...props} node={child} depth={props.depth + 1} />
          ))
        : null}
    </>
  );
}

function FileRow(props: CodeSurfaceExplorerTreeProps & { node: Extract<TreeNode, { kind: 'file' }>; depth: number }) {
  const { t } = useTranslation();
  const active = props.node.path === props.selected;
  const label = props.node.path;
  return (
    <div
      className={`code-surface-tree-row${props.variant === 'sheet' ? ' code-surface-file-option' : ''}${active ? ' is-active' : ''}`}
      data-path={props.node.path}
      role={props.variant === 'sheet' ? 'option' : undefined}
      aria-selected={props.variant === 'sheet' ? active : undefined}
      style={{ '--tree-depth': props.depth } as CSSProperties}
    >
      <button
        type="button"
        className={`code-surface-rail-item${props.variant === 'sheet' ? ' code-surface-file-option-open' : ''}${active ? ' is-active' : ''}${props.node.stagedBy ? ` has-staged-edits is-staged-by-${props.node.stagedBy}` : ''}`}
        draggable={props.editable}
        title={props.node.stagedBy ? t('studioPanel.code.stagedBy', { who: props.node.stagedBy }) : props.node.path}
        onClick={() => props.onSelectFile(props.node.path)}
        onDragStart={() => props.onDragStart(props.node.path, 'file')}
        onDragEnd={props.onDragEnd}
      >
        <span className="code-surface-tree-indent" aria-hidden="true" />
        <span className="code-surface-rail-path code-surface-file-option-path">{label}</span>
        {props.node.stagedBy ? <span className="code-surface-rail-dot" aria-hidden="true" /> : null}
        {active && props.variant === 'sheet' ? <PixelIcon name="check" size={13} /> : null}
      </button>
      {props.editable ? (
        <span className="code-surface-tree-actions">
          <button
            type="button"
            className="code-surface-tree-row-action"
            title={t('studioPanel.code.tree.move')}
            aria-label={t('studioPanel.code.tree.moveItem', { path: props.node.path })}
            disabled={props.busy}
            onClick={() => props.onMoveFile(props.node.path)}
          >
            <PixelIcon name="arrowRight" size={12} />
          </button>
          <button
            type="button"
            className="code-surface-file-option-delete"
            title={t('studioPanel.code.filePickerDelete', { path: props.node.path })}
            aria-label={t('studioPanel.code.filePickerDelete', { path: props.node.path })}
            disabled={props.busy}
            onClick={() => props.onDeleteFile(props.node.path)}
          >
            <PixelIcon name="trash" size={13} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

function FolderRow(
  props: CodeSurfaceExplorerTreeProps & {
    node: Extract<TreeNode, { kind: 'folder' }>;
    depth: number;
    open: boolean;
  },
) {
  const { t } = useTranslation();
  const dropping = props.dropTarget === props.node.path;
  const focused = props.focusedFolder === props.node.path;
  return (
    <div
      className={`code-surface-tree-row code-surface-tree-folder${focused ? ' is-focused' : ''}${dropping ? ' is-drop-target' : ''}`}
      data-path={props.node.path}
      style={{ '--tree-depth': props.depth } as CSSProperties}
      onDragOver={(event) => {
        if (!props.editable) return;
        event.preventDefault();
        event.stopPropagation();
        props.onDragOverFolder(props.node.path);
      }}
      onDrop={(event) => {
        if (!props.editable) return;
        event.preventDefault();
        event.stopPropagation();
        props.onDropOnFolder(props.node.path, event);
      }}
    >
      <button
        type="button"
        className="code-surface-tree-folder-toggle"
        draggable={props.editable}
        aria-expanded={props.open}
        title={props.node.path}
        onClick={() => {
          props.onToggleFolder(props.node.path);
          props.onFocusFolder(props.node.path);
        }}
        onDragStart={() => props.onDragStart(props.node.path, 'folder')}
        onDragEnd={props.onDragEnd}
      >
        <span className="code-surface-tree-indent" aria-hidden="true" />
        <PixelIcon name={props.open ? 'chevronDown' : 'chevronUp'} size={11} />
        <PixelIcon name="folder" size={12} />
        <span className="code-surface-tree-folder-name">{props.node.name}/</span>
      </button>
      {props.editable ? (
        <span className="code-surface-tree-actions">
          <button
            type="button"
            className="code-surface-tree-row-action"
            title={t('studioPanel.code.tree.move')}
            aria-label={t('studioPanel.code.tree.moveItem', { path: props.node.path })}
            disabled={props.busy}
            onClick={() => props.onMoveFolder(props.node.path)}
          >
            <PixelIcon name="arrowRight" size={12} />
          </button>
          <button
            type="button"
            className="code-surface-file-option-delete"
            title={t('studioPanel.code.tree.deleteFolder', { path: props.node.path })}
            aria-label={t('studioPanel.code.tree.deleteFolder', { path: props.node.path })}
            disabled={props.busy}
            onClick={() => props.onDeleteFolder(props.node.path)}
          >
            <PixelIcon name="trash" size={13} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function CodeSurfaceTreeInputs(props: {
  fileRef: RefObject<HTMLInputElement>;
  folderRef: RefObject<HTMLInputElement>;
  archiveRef: RefObject<HTMLInputElement>;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onFolder: (event: ChangeEvent<HTMLInputElement>) => void;
  onArchive: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <input ref={props.fileRef} type="file" hidden multiple onChange={props.onFiles} />
      <input
        ref={props.folderRef}
        type="file"
        hidden
        multiple
        onChange={props.onFolder}
        {...{ webkitdirectory: '', directory: '' }}
      />
      <input
        ref={props.archiveRef}
        type="file"
        hidden
        accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
        onChange={props.onArchive}
      />
    </>
  );
}
