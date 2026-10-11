import type { ReactNode } from 'react';
import type { TreeFile } from '../../web/src/surfaces/studio/codeSurfaceTreeModel.js';
import { CodeFileTree } from './code-file-tree.js';

export function CodeWorkspace({
  filesOpen,
  projectId,
  files,
  selected,
  onSelect,
  onClose,
  children,
}: {
  filesOpen: boolean;
  projectId?: string;
  files: TreeFile[];
  selected: string;
  onSelect: (path: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="code-workspace" id="code-workspace">
      <div className="code-files-container" id="code-files" hidden={!filesOpen}>
        <CodeFileTree key={projectId} files={files} selected={selected} onSelect={onSelect} onClose={onClose} />
      </div>
      <div
        id="code-files-resize"
        className="code-resize"
        hidden={!filesOpen}
        role="separator"
        tabIndex={0}
        aria-label="Resize files"
        aria-orientation="vertical"
        aria-controls="code-files code-workspace"
        title="Drag to resize · arrow keys adjust · double-click to reset"
      />
      {children}
    </div>
  );
}

export function CodePreviewResizeHandle() {
  return (
    <div
      id="code-preview-resize"
      className="code-resize"
      role="separator"
      tabIndex={0}
      aria-label="Resize game preview"
      aria-orientation="horizontal"
      aria-controls="panel game"
      title="Drag to resize · arrow keys adjust · double-click to reset"
    />
  );
}
