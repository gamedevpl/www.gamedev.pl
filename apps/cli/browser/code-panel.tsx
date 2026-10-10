import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirrorEditor from '../../web/src/surfaces/studio/CodeMirrorEditor.js';
import type { CodeSurfaceEditorState } from '../../web/src/surfaces/studio/codeSurfaceEditorState.js';
import {
  createCodeSurfaceLanguageService,
  fromVfsPath,
  toVfsPath,
  type CodeSurfaceLanguageService,
} from '../../web/src/surfaces/studio/codeSurfaceLanguageService.js';
import { languageFor } from '../../web/src/surfaces/studio/codeLanguages.js';
import { buildSourceTree, type TreeNode } from '../../web/src/surfaces/studio/codeSurfaceTreeModel.js';
import { PixelIcon } from '../../web/src/PixelIcon.js';
import { codeApi, CodeRequestError, type CodeFile, type CodeProject, type CompletionStatus } from './code-api.js';

type Draft = { content: string; base: CodeFile; editor?: CodeSurfaceEditorState };
type Workspace = { drafts: Map<string, Draft>; selected: string };
function fileOptions(nodes: TreeNode[], depth = 0): { path: string; label: string }[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder'
      ? fileOptions(node.children, depth + 1)
      : [{ path: node.path, label: `${'　'.repeat(depth)}${node.name}` }],
  );
}

export function CodePanel() {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<CodeProject | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const workspaces = useRef(new Map<string, Workspace>());
  const [selected, setSelected] = useState('');
  const [, redraw] = useState(0);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
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
      ready && service.current && file?.path.endsWith('.ts')
        ? { worker: service.current.worker, path: toVfsPath(file.path) }
        : undefined,
    [ready, file?.path],
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
    const button = document.getElementById('code-open');
    const show = () => {
      document.exitPointerLock?.();
      setOpen((value) => !value);
    };
    button?.addEventListener('click', show);
    const hide = () => {
      completionEpoch.current++;
      setOpen(false);
    };
    const otherPanel = () => {
      if (innerWidth <= 1000) hide();
    };
    window.addEventListener('play-open-panel', otherPanel);
    document.getElementById('clean')?.addEventListener('click', hide);
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest('.cm-editor'))
      )
        setOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      button?.removeEventListener('click', show);
      window.removeEventListener('play-open-panel', otherPanel);
      document.getElementById('clean')?.removeEventListener('click', hide);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => {
    if (!open) completionEpoch.current++;
    document.getElementById('code-open')?.setAttribute('aria-expanded', String(open));
    document.body.dataset.codeOpen = String(open);
    return () => {
      delete document.body.dataset.codeOpen;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const epoch = refreshEpoch.current;
        const next = await codeApi<CodeProject>('/code/project');
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
        for (const entry of next.files) {
          const existing = stored.drafts.get(entry.path);
          if (!existing) stored.drafts.set(entry.path, { content: entry.content, base: entry });
          else if (existing.content === existing.base.content && existing.base.version !== entry.version) {
            stored.drafts.set(entry.path, { content: entry.content, base: entry });
          }
          service.current?.updateFile(entry.path, stored.drafts.get(entry.path)!.content);
        }
        if (changed) {
          setSelected(stored.selected);
          setSelection(undefined);
          setNotice('');
          setProvider('');
          setConsent(false);
          completionEpoch.current++;
        }
        projectRef.current = next;
        setProject(next);
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
  }, [open]);

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
        if (created)
          for (const entry of projectRef.current?.files ?? [])
            created.updateFile(
              entry.path,
              workspaces.current.get(initial.projectId)?.drafts.get(entry.path)?.content ?? entry.content,
            );
        setReady(Boolean(created));
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
  }, [project?.projectId]);

  const chooseFile = (path: string) => {
    if (!workspace) return;
    workspace.selected = path;
    setSelected(path);
    setSelection(undefined);
    setNotice('');
  };
  const edit = (content: string) => {
    if (!draft || !file || file.readOnly) return;
    draft.content = content;
    service.current?.updateFile(file.path, content);
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
          const result = await codeApi<{ text: string }>(
            '/code/completion',
            { projectId: project.projectId, path: selected, prefix, suffix },
            signal,
          );
          return epoch === completionEpoch.current ? result.text : '';
        }
      : undefined;

  return (
    <aside id="code-panel" hidden={!open} aria-labelledby="code-panel-title">
      <header className="panel-head">
        <h2 id="code-panel-title">Code</h2>
        <button aria-label="Close Code" onClick={() => setOpen(false)}>
          <PixelIcon name="close" size={16} />
        </button>
      </header>
      <div className="code-toolbar">
        <label className="sr-only" htmlFor="code-file">
          Project file
        </label>
        <select
          id="code-file"
          value={selected}
          onChange={(event) => chooseFile(event.target.value)}
          disabled={!project}
        >
          {options.map((entry) => (
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
            I reviewed this version · keep my draft
          </button>
        </div>
      )}
      {draft && file && (
        <div className="code-editor">
          <CodeMirrorEditor
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
            }}
          />
        </div>
      )}
      <p className="code-message" role="status">
        {notice}
      </p>
      <details className="code-ai">
        <summary>
          Optional AI completion {project?.completion.selected ? `· ${project.completion.selected} enabled` : '· off'}
        </summary>
        <p>
          TypeScript works locally. AI sends code fragments around the cursor to your selected service. Signed-in
          members can use gamedev.pl within platform limits, without an API key. gamedev.pl forwards fragments to its AI
          provider and covers model costs. Personal providers charge your account; keys stay in the CLI process. Sign in
          with /login in Conversation to use gamedev.pl.
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
