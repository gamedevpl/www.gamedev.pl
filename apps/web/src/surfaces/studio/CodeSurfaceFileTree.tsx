import { CodeSurfaceExplorerTreeView, type CodeSurfaceExplorerTreeProps } from './CodeSurfaceExplorerTreeView.js';

export function CodeSurfaceFileTree(
  props: Pick<CodeSurfaceExplorerTreeProps, 'files' | 'selected' | 'expanded' | 'onSelectFile' | 'onToggleFolder'>,
) {
  const noop = () => {};
  return (
    <CodeSurfaceExplorerTreeView
      {...props}
      variant="rail"
      emptyFolders={[]}
      focusedFolder=""
      editable={false}
      busy={false}
      dropTarget={null}
      t={(key) =>
        key === 'studioPanel.code.stagedBy' ? 'Unsaved draft' : 'Creator Kit · managed outside this project'
      }
      onFocusFolder={noop}
      onNewFile={noop}
      onNewFolder={noop}
      onUploadFiles={noop}
      onUploadFolder={noop}
      onUploadArchive={noop}
      onDeleteFile={noop}
      onDeleteFolder={noop}
      onMoveFile={noop}
      onMoveFolder={noop}
      onDragStart={noop}
      onDragOverFolder={noop}
      onDropOnFolder={noop}
      onDragEnd={noop}
      onRootDrop={noop}
      onRootDragOver={noop}
    />
  );
}
