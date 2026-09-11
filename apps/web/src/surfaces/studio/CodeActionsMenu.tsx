import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import './code-actions-menu.css';
import './code-surface-explorer.css';
import { formatShortcut, fuzzyMatch } from './codeActionsMatch.js';
import { PixelIcon } from '../../PixelIcon.js';

// VS Code-style palette: quick open, commands ('>' prefix), project search.

export type CodeActionsMode = 'files' | 'commands' | 'search';

export type CodeActionsFile = { path: string; changed: boolean };

export type CodeActionsCommand = {
  id: string;
  label: string;
  // Platform-formatted keybinding chip, e.g. "⌘S" / "Ctrl+S".
  hint?: string;
  run: () => void;
};

export type CodeActionsSearchMatch = {
  path: string;
  // 1-based display line.
  line: number;

  // Whole-file offsets, ready for a CodeMirror selection.
  from: number;
  to: number;
  lineText: string;
  lineFrom: number;
  lineTo: number;
};

export type CodeActionsMenuProps = {
  // Parent remounts via key to re-target an already-open palette.
  initialMode: CodeActionsMode;
  files: CodeActionsFile[];

  // Effective content per path: drafts overlay, not last fetch.
  contents: Record<string, string>;
  commands: CodeActionsCommand[];
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenMatch: (match: CodeActionsSearchMatch) => void;
  // acted=true for a command run; omitted (falsy) for a plain dismiss.
  onClose: (acted?: boolean) => void;
};

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_MATCHES = 200;

// Context kept left of a clipped search hit.
const SEARCH_PREVIEW_CONTEXT = 24;

function searchSources(
  files: CodeActionsFile[],
  contents: Record<string, string>,
  query: string,
): CodeActionsSearchMatch[] {
  const needle = query.toLowerCase();
  const out: CodeActionsSearchMatch[] = [];
  if (needle.length < SEARCH_MIN_CHARS) return out;
  for (const file of files) {
    const content = contents[file.path];
    if (content === undefined) continue;
    let offset = 0;
    let line = 1;
    for (const lineText of content.split('\n')) {
      const lower = lineText.toLowerCase();
      let col = lower.indexOf(needle);
      while (col !== -1) {
        out.push({
          path: file.path,
          line,
          from: offset + col,
          to: offset + col + needle.length,
          lineText,
          lineFrom: col,
          lineTo: col + needle.length,
        });
        if (out.length >= SEARCH_MAX_MATCHES) return out;
        col = lower.indexOf(needle, col + needle.length);
      }
      offset += lineText.length + 1;
      line += 1;
    }
  }
  return out;
}

function highlightPositions(text: string, positions: number[]): ReactNode {
  if (positions.length === 0) return text;
  const matched = new Set(positions);
  return [...text].map((char, index) =>
    matched.has(index) ? (
      <mark key={index} className="code-surface-palette-hl">
        {char}
      </mark>
    ) : (
      char
    ),
  );
}

// Clips long lines so the hit stays visible; CSS clips right.
function matchPreview(match: CodeActionsSearchMatch): { text: string; from: number; to: number; clipped: boolean } {
  const leading = /^\s*/.exec(match.lineText)![0].length;
  const start = Math.min(Math.max(leading, match.lineFrom - SEARCH_PREVIEW_CONTEXT), match.lineFrom);
  return {
    text: match.lineText.slice(start),
    from: match.lineFrom - start,
    to: match.lineTo - start,
    clipped: start > leading,
  };
}

type FileItem = { file: CodeActionsFile; score: number; positions: number[] };
type CommandItem = { command: CodeActionsCommand; internal: boolean; positions: number[] };

export function CodeActionsMenu({
  initialMode,
  files,
  contents,
  commands,
  selectedPath,
  onOpenFile,
  onOpenMatch,
  onClose,
}: CodeActionsMenuProps) {
  const { t } = useTranslation();
  // 'commands' is quick open with a visible '>' prefix, like VS Code.
  const [mode, setMode] = useState<'files' | 'search'>(initialMode === 'search' ? 'search' : 'files');
  const [query, setQuery] = useState(initialMode === 'commands' ? '>' : '');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const displayMode: CodeActionsMode = mode === 'files' && query.startsWith('>') ? 'commands' : mode;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, mode]);

  const fileItems = useMemo((): FileItem[] => {
    if (displayMode !== 'files') return [];
    const trimmed = query.trim();
    if (!trimmed) return files.map((file) => ({ file, score: 0, positions: [] }));
    return files
      .map((file) => ({ file, match: fuzzyMatch(trimmed, file.path) }))
      .filter((entry): entry is { file: CodeActionsFile; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => {
        return entry.match !== null;
      })
      .map((entry) => ({ file: entry.file, score: entry.match.score, positions: entry.match.positions }))
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  }, [displayMode, files, query]);

  const commandItems = useMemo((): CommandItem[] => {
    if (displayMode !== 'commands') return [];
    const needle = (query.startsWith('>') ? query.slice(1) : query).trim();
    const navigation: { command: CodeActionsCommand; internal: true }[] = [
      {
        internal: true,
        command: {
          id: 'goToFile',
          label: t('studioPanel.code.actions.commandGoToFile'),
          hint: formatShortcut('P'),
          run: () => {
            setMode('files');
            setQuery('');
          },
        },
      },
      {
        internal: true,
        command: {
          id: 'searchInFiles',
          label: t('studioPanel.code.actions.commandSearchInFiles'),
          hint: formatShortcut('F', { shift: true }),
          run: () => {
            setMode('search');
            setQuery('');
          },
        },
      },
    ];
    const all = [...navigation, ...commands.map((command) => ({ command, internal: false as const }))];
    if (!needle) return all.map((entry) => ({ ...entry, positions: [] }));
    return all
      .map((entry) => ({ entry, match: fuzzyMatch(needle, entry.command.label) }))
      .filter((scored) => scored.match !== null)
      .map((scored) => ({ ...scored.entry, positions: scored.match!.positions }));
  }, [displayMode, query, commands, t]);

  const searchQuery = mode === 'search' ? query.trim() : '';
  const searchItems = useMemo(() => searchSources(files, contents, searchQuery), [files, contents, searchQuery]);

  const itemCount =
    displayMode === 'files' ? fileItems.length : displayMode === 'commands' ? commandItems.length : searchItems.length;
  const active = Math.min(activeIndex, Math.max(0, itemCount - 1));

  useEffect(() => {
    // jsdom lacks scrollIntoView — optional call, like the rail.
    listRef.current?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, displayMode]);

  function executeCommand(item: CommandItem) {
    if (item.internal) {
      item.command.run();
      inputRef.current?.focus();
      return;
    }
    onClose(true);
    item.command.run();
  }

  function executeActive() {
    if (displayMode === 'files') {
      const item = fileItems[active];
      if (item) onOpenFile(item.file.path);
    } else if (displayMode === 'commands') {
      const item = commandItems[active];
      if (item) executeCommand(item);
    } else {
      const item = searchItems[active];
      if (item) onOpenMatch(item);
    }
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, Math.max(0, itemCount - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      executeActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function switchTo(next: CodeActionsMode) {
    setMode(next === 'search' ? 'search' : 'files');
    setQuery(next === 'commands' ? '>' : '');
    inputRef.current?.focus();
  }

  const placeholder =
    displayMode === 'files'
      ? t('studioPanel.code.actions.filesPlaceholder')
      : displayMode === 'commands'
        ? t('studioPanel.code.actions.commandsPlaceholder')
        : t('studioPanel.code.actions.searchPlaceholder');

  const emptyLabel =
    displayMode === 'files'
      ? t('studioPanel.code.actions.noFiles')
      : displayMode === 'commands'
        ? t('studioPanel.code.actions.noCommands')
        : searchQuery.length < SEARCH_MIN_CHARS
          ? t('studioPanel.code.actions.searchHint', { count: SEARCH_MIN_CHARS })
          : t('studioPanel.code.actions.noMatches');

  const tabs: { mode: CodeActionsMode; label: string; hint: string }[] = [
    { mode: 'files', label: t('studioPanel.code.actions.tabFiles'), hint: formatShortcut('P') },
    { mode: 'commands', label: t('studioPanel.code.actions.tabCommands'), hint: formatShortcut('P', { shift: true }) },
    { mode: 'search', label: t('studioPanel.code.actions.tabSearch'), hint: formatShortcut('F', { shift: true }) },
  ];

  return (
    <div className="code-surface-palette-backdrop" role="presentation" onClick={() => onClose()}>
      <section
        className="code-surface-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('studioPanel.code.actions.title')}
        data-testid="code-actions-menu"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="code-surface-palette-head">
          <div className="code-surface-palette-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.mode}
                type="button"
                className={`code-surface-palette-tab${displayMode === tab.mode ? ' is-active' : ''}`}
                onClick={() => switchTo(tab.mode)}
              >
                {tab.label}
                <kbd className="code-surface-palette-kbd">{tab.hint}</kbd>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => onClose()}
            aria-label={t('studioPanel.code.actions.close')}
          >
            <PixelIcon name="close" size={13} />
          </button>
        </header>

        <div className="code-surface-palette-input-row">
          <PixelIcon name={displayMode === 'commands' ? 'bolt' : 'search'} size={13} />
          <input
            ref={inputRef}
            className="code-surface-palette-input"
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="code-actions-listbox"
            aria-activedescendant={itemCount > 0 ? `code-actions-option-${active}` : undefined}
            aria-autocomplete="list"
            aria-label={t('studioPanel.code.actions.title')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div
          className="code-surface-palette-results"
          id="code-actions-listbox"
          role="listbox"
          aria-label={t('studioPanel.code.actions.title')}
          ref={listRef}
        >
          {itemCount === 0 ? (
            <p className="code-surface-palette-empty">{emptyLabel}</p>
          ) : displayMode === 'files' ? (
            fileItems.map((item, index) => (
              <button
                key={item.file.path}
                type="button"
                id={`code-actions-option-${index}`}
                role="option"
                aria-selected={index === active}
                className={`code-surface-palette-option${index === active ? ' is-active' : ''}`}
                onClick={() => onOpenFile(item.file.path)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <PixelIcon name="code" size={12} />
                <span className="code-surface-palette-option-path">
                  {highlightPositions(item.file.path, item.positions)}
                </span>
                {item.file.changed ? <span className="code-surface-rail-dot" aria-hidden="true" /> : null}
                {item.file.path === selectedPath ? <PixelIcon name="check" size={12} /> : null}
              </button>
            ))
          ) : displayMode === 'commands' ? (
            commandItems.map((item, index) => (
              <button
                key={item.command.id}
                type="button"
                id={`code-actions-option-${index}`}
                role="option"
                aria-selected={index === active}
                className={`code-surface-palette-option${index === active ? ' is-active' : ''}`}
                onClick={() => executeCommand(item)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <PixelIcon name="bolt" size={12} />
                <span className="code-surface-palette-option-label">
                  {highlightPositions(item.command.label, item.positions)}
                </span>
                {item.command.hint ? <kbd className="code-surface-palette-kbd">{item.command.hint}</kbd> : null}
              </button>
            ))
          ) : (
            searchItems.map((match, index) => {
              const preview = matchPreview(match);
              const firstOfFile = index === 0 || searchItems[index - 1]!.path !== match.path;
              return (
                <Fragment key={`${match.path}:${match.from}`}>
                  {firstOfFile ? (
                    <div className="code-surface-palette-group" aria-hidden="true">
                      {match.path}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    id={`code-actions-option-${index}`}
                    role="option"
                    aria-selected={index === active}
                    aria-label={`${match.path}:${match.line} ${match.lineText.trim()}`}
                    className={`code-surface-palette-option is-match${index === active ? ' is-active' : ''}`}
                    onClick={() => onOpenMatch(match)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="code-surface-palette-line">{match.line}</span>
                    <span className="code-surface-palette-preview">
                      {preview.clipped ? '…' : ''}
                      {preview.text.slice(0, preview.from)}
                      <mark className="code-surface-palette-hl">{preview.text.slice(preview.from, preview.to)}</mark>
                      {preview.text.slice(preview.to)}
                    </span>
                  </button>
                </Fragment>
              );
            })
          )}
        </div>

        {displayMode === 'search' && searchQuery.length >= SEARCH_MIN_CHARS ? (
          <footer className="code-surface-palette-foot" aria-live="polite">
            {searchItems.length >= SEARCH_MAX_MATCHES
              ? t('studioPanel.code.actions.matchCapped', { count: SEARCH_MAX_MATCHES })
              : t('studioPanel.code.actions.matchCount', { count: searchItems.length })}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
