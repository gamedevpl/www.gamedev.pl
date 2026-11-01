import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { buildSourceTree, type TreeFile, type TreeNode } from './codeSurfaceTreeModel.js';
import { PixelIcon } from '../../PixelIcon.js';
import './code-surface-explorer.css';

const LOCKED_DIRS = ['shared/', 'tools/'] as const;

export type CodeSurfaceExplorerTreeProps = {
  variant: 'rail' | 'sheet';
  files: TreeFile[];
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

type TreeLabels = { t: (key: string, options?: Record<string, string>) => string };

type RowMenuProps = {
  busy: boolean;
  menuLabel: string;
  moveLabel: string;
  moveAria: string;
  deleteLabel: string;
  deleteAria: string;
  onMove: () => void;
  onDelete: () => void;
};

function placeRowMenu(trigger: HTMLElement, menu: HTMLElement) {
  const margin = 8;
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let top = triggerRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - margin) top = triggerRect.top - 4 - menuRect.height;
  if (top < margin) top = margin;
  let left = triggerRect.right - menuRect.width;
  if (left < margin) left = margin;
  const maxLeft = window.innerWidth - margin - menuRect.width;
  if (left > maxLeft) left = Math.max(margin, maxLeft);
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

function RowMenu(props: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.busy) setOpen(false);
  }, [props.busy]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const place = () => placeRowMenu(trigger, menu);
    place();
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') {
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      items[items.length - 1]?.focus();
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = index === -1 ? 0 : (index + delta + items.length) % items.length;
    items[next]?.focus();
  }

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <span className={`code-surface-tree-actions${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="code-surface-tree-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.menuLabel}
        title={props.menuLabel}
        disabled={props.busy}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="code-surface-tree-kebab" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="code-surface-tree-menu"
              role="menu"
              aria-label={props.menuLabel}
              onKeyDown={onMenuKeyDown}
            >
              <button
                type="button"
                role="menuitem"
                className="code-surface-tree-menu-item"
                aria-label={props.moveAria}
                onClick={() => choose(props.onMove)}
              >
                <PixelIcon name="arrowRight" size={12} />
                <span>{props.moveLabel}</span>
              </button>
              <div className="code-surface-tree-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="code-surface-tree-menu-item is-danger"
                aria-label={props.deleteAria}
                onClick={() => choose(props.onDelete)}
              >
                <PixelIcon name="trash" size={13} />
                <span>{props.deleteLabel}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export function CodeSurfaceExplorerTreeView(props: CodeSurfaceExplorerTreeProps & TreeLabels) {
  const { t } = props;
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

function TreeRows(props: CodeSurfaceExplorerTreeProps & TreeLabels & { node: TreeNode; depth: number }) {
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

function FileRow(
  props: CodeSurfaceExplorerTreeProps & TreeLabels & { node: Extract<TreeNode, { kind: 'file' }>; depth: number },
) {
  const { t } = props;
  const active = props.node.path === props.selected;
  const label = props.node.name;
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
        <RowMenu
          busy={props.busy}
          menuLabel={t('studioPanel.code.tree.rowMenu', { path: props.node.path })}
          moveLabel={t('studioPanel.code.tree.move')}
          moveAria={t('studioPanel.code.tree.moveItem', { path: props.node.path })}
          deleteLabel={t('studioPanel.code.tree.delete')}
          deleteAria={t('studioPanel.code.filePickerDelete', { path: props.node.path })}
          onMove={() => props.onMoveFile(props.node.path)}
          onDelete={() => props.onDeleteFile(props.node.path)}
        />
      ) : null}
    </div>
  );
}

function FolderRow(
  props: CodeSurfaceExplorerTreeProps &
    TreeLabels & {
      node: Extract<TreeNode, { kind: 'folder' }>;
      depth: number;
      open: boolean;
    },
) {
  const { t } = props;
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
        <RowMenu
          busy={props.busy}
          menuLabel={t('studioPanel.code.tree.rowMenu', { path: props.node.path })}
          moveLabel={t('studioPanel.code.tree.move')}
          moveAria={t('studioPanel.code.tree.moveItem', { path: props.node.path })}
          deleteLabel={t('studioPanel.code.tree.delete')}
          deleteAria={t('studioPanel.code.tree.deleteFolder', { path: props.node.path })}
          onMove={() => props.onMoveFolder(props.node.path)}
          onDelete={() => props.onDeleteFolder(props.node.path)}
        />
      ) : null}
    </div>
  );
}
