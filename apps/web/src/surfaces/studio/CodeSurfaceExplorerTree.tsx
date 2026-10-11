import type { ChangeEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeSurfaceExplorerTreeView, type CodeSurfaceExplorerTreeProps } from './CodeSurfaceExplorerTreeView.js';
export type { CodeSurfaceExplorerTreeProps } from './CodeSurfaceExplorerTreeView.js';

export function CodeSurfaceExplorerTree(props: CodeSurfaceExplorerTreeProps) {
  const { t } = useTranslation();
  return <CodeSurfaceExplorerTreeView {...props} t={t} />;
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
