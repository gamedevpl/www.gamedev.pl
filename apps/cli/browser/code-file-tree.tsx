import { useEffect, useState } from 'react';
import { PixelIcon } from '../../web/src/PixelIcon.js';
import { CodeSurfaceFileTree } from '../../web/src/surfaces/studio/CodeSurfaceFileTree.js';
import { parentDir } from '../../web/src/surfaces/studio/codeSurfacePaths.js';
import type { TreeFile } from '../../web/src/surfaces/studio/codeSurfaceTreeModel.js';

export function CodeFileTree({
  files,
  selected,
  onSelect,
  onClose,
}: {
  files: TreeFile[];
  selected: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      let folder = parentDir(selected);
      while (folder) {
        next.add(folder);
        folder = parentDir(folder);
      }
      return next;
    });
  }, [selected]);
  return (
    <nav className="code-files" aria-label="Project files">
      <div className="code-files-head">
        <span>Files</span>
        <button aria-label="Hide files" title="Hide files" onClick={onClose}>
          <PixelIcon name="close" size={14} />
        </button>
      </div>
      <CodeSurfaceFileTree
        files={files}
        selected={selected}
        expanded={expanded}
        onSelectFile={onSelect}
        onToggleFolder={(path) => {
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          });
        }}
      />
    </nav>
  );
}
