import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirrorEditor from '../../web/src/surfaces/studio/CodeMirrorEditor.js';
import {
  createCodeSurfaceLanguageService,
  fromVfsPath,
  toVfsPath,
  type CodeSurfaceLanguageService,
} from '../../web/src/surfaces/studio/codeSurfaceLanguageService.js';
import { languageFor } from '../../web/src/surfaces/studio/codeLanguages.js';
import { buildSourceTree, type TreeNode } from '../../web/src/surfaces/studio/codeSurfaceTreeModel.js';
import { CodePanelViewControls, useCodePanelView } from './code-panel-view.js';
import { codeApi, CodeRequestError, type CodeFile, type CodeProject, type CompletionStatus } from './code-api.js';
import { refreshCodeProject, syncCodeLanguageFiles } from './code-project-sync.js';
import { useCodeDrafts, reconcileCodeDrafts } from './code-drafts.js';
import { reportCodeCompletion, reportCodeStep } from './code-telemetry.js';

function fileOptions(nodes: TreeNode[]): { path: string; label: string }[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder' ? fileOptions(node.children) : [{ path: node.path, label: node.path }],
  );
}

export function CodePanel() {
  const panelView = useCodePanelView();
  const { open, view } = panelView;
  const [project, setProject] = useState<CodeProject | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const { workspaces, persist, backupWarning } = useCodeDrafts();
  const syncedFiles = useRef(new Map<string, string>());
  const unavailableFiles = useRef(new Map<string, string>());
  const [fileSearch, setFileSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [, redraw] = useState(0);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [languageRevision, setLanguageRevision] = useState(0);
  const service = useRef<CodeSurfaceLanguageService | null>(null);
  const [selection, setSelection] = useState<{ anchor: number; head: number }>();
  const [provider, setProvider] = useState('');
  const [consent, setConsent] = useState(false);
  const [completionBusy, setCompletionBusy] = useState(false);
  const completionEpoch = useRef(0);
  const refreshEpoch = useRef(0);
  const workspace = project ? workspaces.current.get(project.projectId) : undefined;
  const draft = workspace?.drafts.get(selected);
  const diskFile = project?.files.find((entry) => entry.path === selected);
  const file = diskFile ?? draft?.base;
  const dirty = Boolean(draft && draft.content !== draft.base.content);
  const conflict = Boolean(draft && dirty && (!diskFile || draft.base.version !== diskFile.version));
  const languageService = useMemo(
    () =>
      ready && service.current && diskFile?.path.endsWith('.ts')
        ? { worker: service.current.worker, path: toVfsPath(diskFile.path), revision: languageRevision }
        : undefined,
    [ready, diskFile?.path, languageRevision],
  );
  const options = useMemo(
    () =>
      fileOptions(
        buildSourceTree([
          ...(project?.files ?? []),
          ...[...(workspace?.drafts.values() ?? [])]
            .filter((entry) => !project?.files.some((file) => file.path === entry.base.path))
            .map((entry) => entry.base),
        ]),
      ),
    [project?.files, workspace],
  );

  useEffect(() => {
    if (!open) completionEpoch.current++;
    else reportCodeStep('opened');
    document.getElementById('code-open')?.setAttribute('aria-expanded', String(open));
    document.body.dataset.codeOpen = String(open);
    return () => {
      delete document.body.dataset.codeOpen;
    };
  }, [open]);
  useEffect(() => {
    if (conflict) reportCodeStep('conflict_seen');
  }, [conflict]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const epoch = refreshEpoch.current;
        const next = await refreshCodeProject(projectRef.current, unavailableFiles.current);
        if (cancelled || epoch !== refreshEpoch.current) return;
        const changed = projectRef.current?.projectId !== next.projectId;
        let stored = workspaces.current.get(next.projectId);
        if (!stored) {
          stored = {
            drafts: new Map(),
            selected:
              next.files.find((entry) => !entry.readOnly && entry.path.endsWith('game.ts'))?.path ??
              next.files.find((entry) => !entry.readOnly)?.path ??
              '',
          };
          workspaces.current.set(next.projectId, stored);
        }
        reconcileCodeDrafts(stored, next.files);
        setSelected(stored.selected);
        if (
          !changed &&
          service.current &&
          syncCodeLanguageFiles(
            service.current,
            syncedFiles.current,
            Object.fromEntries(
              next.files
                .filter((entry) => entry.path.endsWith('.ts'))
                .map((entry) => [entry.path, stored!.drafts.get(entry.path)!.content]),
            ),
          )
        )
          setLanguageRevision((revision) => revision + 1);
        if (changed) {
          setSelected(stored.selected);
          setSelection(undefined);
          setNotice('');
          setProvider('');
          setConsent(false);
          completionEpoch.current++;
          setFileSearch('');
        }
        projectRef.current = next;
        setProject(next);
        persist();
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof CodeRequestError && error.status === 404
              ? 'Open a local game checkout to use Code. Drafts from earlier projects are kept in this tab.'
              : 'Code is offline. Your drafts are preserved.',
          );
          if (error instanceof CodeRequestError && error.status === 404) {
            setProject(null);
            projectRef.current = null;
          }
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 3000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, persist, workspaces]);

  useEffect(() => {
    const initial = projectRef.current;
    if (!initial) return;
    let cancelled = false;
    let objectUrl = '';
    setReady(false);
    void (async () => {
      try {
        const { script } = await codeApi<{ script: string }>('/code/worker');
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
        const files = Object.fromEntries(
          initial.files
            .filter((entry) => entry.path.endsWith('.ts'))
            .map((entry) => [
              entry.path,
              workspaces.current.get(initial.projectId)?.drafts.get(entry.path)?.content ?? entry.content,
            ]),
        );
        const created = await createCodeSurfaceLanguageService(files, null, {}, () => new Worker(objectUrl));
        if (cancelled) {
          created?.destroy();
          return;
        }
        service.current = created;
        syncedFiles.current = new Map(Object.entries(files));
        if (created)
          syncCodeLanguageFiles(
            created,
            syncedFiles.current,
            Object.fromEntries(
              (projectRef.current?.files ?? [])
                .filter((entry) => entry.path.endsWith('.ts'))
                .map((entry) => [
                  entry.path,
                  workspaces.current.get(initial.projectId)?.drafts.get(entry.path)?.content ?? entry.content,
                ]),
            ),
          );
        setReady(Boolean(created));
        if (created) reportCodeStep('typechecked');
      } catch {
        if (!cancelled) setNotice('Local TypeScript service could not start. Reopen Play to retry.');
      }
    })();
    return () => {
      cancelled = true;
      service.current?.destroy();
      service.current = null;
      setReady(false);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project?.projectId, workspaces]);

  const chooseFile = (path: string) => {
    if (!workspace) return;
    workspace.selected = path;
    persist();
    setSelected(path);
    reportCodeStep('file_opened');
    setSelection(undefined);
    setNotice('');
  };
  const edit = (content: string) => {
    if (!draft || !file || file.readOnly) return;
    draft.content = content;
    reportCodeStep('edited');
    if (diskFile && file.path.endsWith('.ts')) {
      service.current?.updateFile(file.path, content);
      syncedFiles.current.set(file.path, content);
    }
    persist();
    redraw((value) => value + 1);
  };
  const save = async () => {
    if (!project || !draft || !file || !dirty || saving || file.readOnly) return;
    const snapshot = {
      projectId: project.projectId,
      path: file.path,
      version: draft.base.version,
      content: draft.content,
    };
    refreshEpoch.current++;
    setSaving(true);
    try {
      const result = await codeApi<{ file: CodeFile }>('/code/save', snapshot);
      refreshEpoch.current++;
      draft.base = result.file;
      if (projectRef.current?.projectId === snapshot.projectId) {
        setProject(
          (current) =>
            current && {
              ...current,
              files: current.files.map((entry) => (entry.path === snapshot.path ? result.file : entry)),
            },
        );
        setNotice('Saved locally. Play rebuilds and applies updates using the selected update policy.');
      }
    } catch (error) {
      if (projectRef.current?.projectId === snapshot.projectId) {
        if (error instanceof CodeRequestError && error.data.file) {
          const incoming = error.data.file;
          setProject(
            (current) =>
              current && {
                ...current,
                files: current.files.map((entry) => (entry.path === incoming.path ? incoming : entry)),
              },
          );
        }
        setNotice(
          'Save refused: the checkout is busy or the file changed. Your draft is preserved. Compare the disk version before saving again.',
        );
      }
    } finally {
      setSaving(false);
      persist();
      redraw((value) => value + 1);
    }
  };
  const changeCompletion = async (enabled: boolean) => {
    if (!project) return;
    completionEpoch.current++;
    refreshEpoch.current++;
    setCompletionBusy(true);
    try {
      const status = await codeApi<CompletionStatus>('/code/completion/settings', {
        projectId: project.projectId,
        provider: enabled ? provider : null,
        consent: enabled && consent,
      });
      refreshEpoch.current++;
      setProject((current) =>
        current && current.projectId === project.projectId ? { ...current, completion: status } : current,
      );
    } catch {
      setNotice('Could not change AI completion settings.');
    } finally {
      setCompletionBusy(false);
    }
  };
  const fetchGhostText =
    project?.completion.selected && open
      ? async (prefix: string, suffix: string, signal: AbortSignal) => {
          const epoch = completionEpoch.current;
          let result;
          try {
            result = await codeApi<{ text: string }>(
              '/code/completion',
              { projectId: project.projectId, path: selected, prefix, suffix },
              signal,
            );
          } catch (error) {
            if (!signal.aborted)
              setNotice(
                error instanceof CodeRequestError && error.status === 429
                  ? 'AI completion rate or quota limit reached. Wait before retrying; TypeScript suggestions remain available.'
                  : 'AI completion is unavailable. TypeScript suggestions remain available.',
              );
            throw error;
          }
          return epoch === completionEpoch.current ? result.text : '';
        }
      : undefined;

  return (
    <aside
      id="code-panel"
      hidden={!open}
      data-view={view}
      data-maximized={view === 'editor'}
      aria-labelledby="code-panel-title"
    >
      <header className="panel-head">
        <h2 id="code-panel-title">Code</h2>
        <CodePanelViewControls {...panelView} />
      </header>
      <div className="code-toolbar">
        <input
          aria-label="Search project files"
          placeholder="Find a file…"
          value={fileSearch}
          onChange={(event) => setFileSearch(event.target.value)}
        />
        <label className="sr-only" htmlFor="code-file">
          Project file
        </label>
        <select
          id="code-file"
          value={selected}
          onChange={(event) => chooseFile(event.target.value)}
          disabled={!project}
        >
          {options
            .filter((entry) => entry.path === selected || entry.label.toLowerCase().includes(fileSearch.toLowerCase()))
            .map((entry) => (
              <option key={entry.path} value={entry.path}>
                {entry.label}
              </option>
            ))}
        </select>
        <button id="code-save" onClick={() => void save()} disabled={!dirty || saving || file?.readOnly || !file}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="code-status">
        {file?.readOnly ? 'Creator Kit · read-only' : dirty ? 'Unsaved draft · Ctrl/Cmd+S to save' : 'Saved locally'} ·
        TypeScript {ready ? 'ready · Ctrl/Cmd-click for definition' : 'starting…'}
      </div>
      {conflict && (
        <div className="code-conflict" role="alert">
          This file changed on disk. Your draft is kept.
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(draft?.content ?? '')
                .then(() => setNotice('Draft copied.'))
                .catch(() => setNotice('Select and copy the draft in the editor.'));
            }}
          >
            Copy draft
          </button>
          <details>
            <summary>Compare disk version</summary>
            <pre>
              {diskFile?.content ?? 'File deleted on disk. Copy your draft before restoring the file externally.'}
            </pre>
          </details>
          <button
            disabled={!diskFile}
            onClick={() => {
              if (draft && diskFile) {
                draft.base = diskFile;
                redraw((value) => value + 1);
                setNotice('Disk version reviewed. Saving now replaces that version with your draft.');
              }
            }}
          >
            I reviewed this version · next save overwrites disk changes
          </button>
        </div>
      )}
      {draft && file && (
        <div className="code-editor">
          <CodeMirrorEditor
            reportCompletion={reportCodeCompletion}
            key={`${project?.projectId}:${file.path}`}
            value={draft.content}
            language={languageFor(file.path)}
            onChange={edit}
            onSave={() => void save()}
            diagnostics={[]}
            readOnly={file.readOnly}
            languageService={languageService}
            onGotoDefinition={(path, from, to) => {
              const target = fromVfsPath(path);
              if (project?.files.some((entry) => entry.path === target)) {
                chooseFile(target);
                setSelection({ anchor: from, head: to });
              }
            }}
            initialSelection={selection}
            fetchGhostText={fetchGhostText}
            initialEditorState={draft.editor}
            onEditorStateChange={(state) => {
              draft.editor = state;
              persist();
            }}
          />
        </div>
      )}
      <p className="code-message" role="status">
        {notice || backupWarning}
      </p>
      <details className="code-ai">
        <summary>
          Optional AI completion {project?.completion.selected ? `· ${project.completion.selected} enabled` : '· off'}
        </summary>
        <p>
          TypeScript works locally. AI sends code fragments around the cursor to your selected service. Signed-in
          members can use gamedev.pl within platform limits, without an API key. gamedev.pl forwards fragments to its AI
          provider, Google Vertex AI, and covers model costs. Personal providers charge your account; keys stay in the
          CLI process. Sign in with /login in Conversation to use gamedev.pl.
        </p>
        <label htmlFor="code-provider">Provider</label>
        <select
          id="code-provider"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setConsent(false);
          }}
          disabled={Boolean(project?.completion.selected)}
        >
          <option value="">Choose a provider</option>
          {project?.completion.providers.map((entry) => (
            <option key={entry.id} value={entry.id} disabled={!entry.available}>
              {entry.id === 'gamedev' ? 'gamedev.pl · included for members' : entry.id}
              {entry.available ? ' · available' : ' · unavailable'}
            </option>
          ))}
        </select>
        <label className="code-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />I agree to
          send code fragments{provider === 'gamedev' ? ' to gamedev.pl.' : ' and pay my provider.'}
        </label>
        <button
          disabled={completionBusy || !project || (!project.completion.selected && (!provider || !consent))}
          onClick={() => void changeCompletion(!project?.completion.selected)}
        >
          {project?.completion.selected ? 'Disable AI completion' : 'Enable AI completion'}
        </button>
      </details>
    </aside>
  );
}
