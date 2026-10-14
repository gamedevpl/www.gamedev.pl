import { TaskDebug } from './debug.js';
import { CommandSuggestions, useCommandCompletion } from './completion.js';
import { BusyPanel } from './busy.js';
import { useEffect, useRef, useState } from 'react';
import { Box, Text, useStdout, type DOMElement, type Key } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { RichText } from './transcript.js';
import { CLI_BIN } from '../bin-name.js';
import { glyphs } from '../renderer.js';
import { CLI_VERSION } from '../update.js';
import type { TuiSession, TuiState } from './session.js';
import { DiffViewer } from './diff.js';
import { ConversationLayout } from './conversation-layout.js';
import { WorkspacePanel, useWorkspaceChanges } from './workspace-panel.js';
import type { WorkspaceCheckout } from './workspace-status.js';
import { useMouseReporting, useTerminalInput, wheelInside } from './mouse.js';
import { ALT_CLEAR, useAltScreen } from './alt-screen.js';
import { useSelection, type Clipboard, type Regions } from './selection.js';
import { systemClipboard } from './screen-grid.js';

export function draftViewport(draft: string, cursor: number, width: number) {
  const chars = [...draft];
  const room = Math.max(1, width - 3);
  const leftRoom = Math.floor(room / 2);
  let start = Math.max(0, cursor - leftRoom);
  let end = Math.min(chars.length, start + room);
  if (end === chars.length) start = Math.max(0, end - room);
  if (start === 0) end = Math.min(chars.length, room);
  return {
    before: chars.slice(start, cursor).join(''),
    after: chars.slice(cursor, end).join(''),
    hiddenBefore: start > 0,
    hiddenAfter: end < chars.length,
  };
}

export function ReplApp({
  session,
  color,
  historyOffset = 0,
  openPreview,
  readLogs,
  checkout,
  initialSidebar = process.env.GAMEDEV_SIDEBAR === '1',
  mouse = process.env.GAMEDEV_DISABLE_MOUSE !== '1',
  clipboard = systemClipboard,
}: {
  session: TuiSession;
  color: boolean;
  historyOffset?: number;
  openPreview?: (url: string) => void;
  readLogs?: () => string[];
  checkout?: () => WorkspaceCheckout | null;
  initialSidebar?: boolean;
  mouse?: boolean;
  clipboard?: Clipboard;
}) {
  const [state, setState] = useState<TuiState>(session.get);
  const [debug, setDebug] = useState(false);
  const [viewDiff, setViewDiff] = useState(false);
  const newestDiff = state.diffs.at(-1);
  const seenDiff = useRef(newestDiff?.id ?? 0);
  useEffect(() => {
    if (newestDiff && newestDiff.id > seenDiff.current) {
      seenDiff.current = newestDiff.id;
      setDebug(false);
      setViewDiff(true);
    }
  }, [newestDiff]);
  const completion = useCommandCompletion(state, session);
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({ rows: stdout.rows || 24, columns: stdout.columns || 80 });
  const [sidebar, setSidebar] = useState(initialSidebar);
  const activeCheckout = checkout?.() ?? null;
  const canSplit = Boolean(activeCheckout) && dimensions.columns >= 120 && dimensions.rows >= 16;
  const alt = useAltScreen(canSplit && sidebar);
  const split = canSplit && sidebar && alt;
  const altRef = useRef(alt);
  altRef.current = alt;
  useMouseReporting(split && mouse);
  const regions = useRef<Regions>({ chat: null, column: null, panel: null });
  const choicePanel = useRef<DOMElement>(null);
  const panelWidth = split ? Math.min(44, Math.floor(dimensions.columns / 3)) : 0;
  const width = split ? dimensions.columns - panelWidth : Math.min(dimensions.columns, 110);
  const rows = dimensions.rows - Number(split);
  const selection = useSelection({ enabled: split && mouse, rows, regions, clipboard });
  const changes = useWorkspaceChanges(activeCheckout, split);
  const [detailScroll, setDetailScroll] = useState({ promptId: -1, offset: 0 });
  useEffect(() => session.subscribe(setState), [session]);
  useEffect(() => {
    const onResize = (): void => {
      // A resized alternate screen keeps stale cells Ink no longer tracks.
      if (altRef.current) stdout.write(ALT_CLEAR);
      setDimensions({ rows: stdout.rows || 24, columns: stdout.columns || 80 });
    };
    // Resize the layout before Ink redraws against the new terminal width.
    stdout.prependListener('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  const shellMode =
    !state.question &&
    (state.mode === 'prompt' || Boolean(state.localTask && state.mode === 'busy')) &&
    state.draft.trimStart().startsWith('!');
  const shellPrefix = shellMode ? [...state.draft].indexOf('!') + 1 : 0;
  const shellDraft = state.draft.slice(shellPrefix);
  const onInput = (input: string, key: Key): void => {
    if (selection.clear() && key.escape) return;
    if (viewDiff) return;
    if (key.ctrl && input === 'b' && (canSplit || sidebar)) {
      setSidebar((visible) => !visible);
      return;
    }
    if (key.ctrl && input === 'd' && newestDiff) {
      setDebug(false);
      setViewDiff(true);
      return;
    }
    if (debug) {
      if (key.ctrl && input === 'c') session.cancel();
      return;
    }
    if (key.ctrl && input === 'l' && readLogs) {
      setDebug(true);
      return;
    }
    if (key.return && state.mode === 'prompt' && !state.question && state.draft.trim() === '/logs' && readLogs) {
      session.setDraft('');
      setDebug(true);
      return;
    }
    if (shellMode) {
      if (key.escape || ((key.backspace || key.delete) && !shellDraft)) {
        session.setDraft('');
        return;
      }
      if ((key.leftArrow || key.backspace || key.delete) && state.draftCursor <= shellPrefix) return;
      if ((key.return || (key.ctrl && input === 'q')) && !shellDraft.trim()) return;
    }
    if (state.mode === 'busy') {
      if (key.ctrl && input === 'c') {
        session.cancel();
        return;
      }
      if (state.localTask) {
        if (key.ctrl && input === 'o' && state.previewUrl) openPreview?.(state.previewUrl);
        else if (key.ctrl && input === 'q') session.queueDraft();
        else if (key.return) {
          if (state.draft.trim() === '/logs' && readLogs) {
            session.setDraft('');
            setDebug(true);
            return;
          }
          if (state.canSteer && !state.draft.trimStart().startsWith('!')) void session.sendDraft();
          else session.queueDraft();
        } else if (key.leftArrow) session.moveDraftCursor(-1);
        else if (key.rightArrow) session.moveDraftCursor(1);
        else if (key.backspace || key.delete) session.deleteLast();
        else if (!key.ctrl && !key.meta && input) session.insertDraft(input);
        return;
      }
      if (!key.ctrl && !key.meta && input.toLowerCase() === 'o' && state.previewUrl) {
        openPreview?.(state.previewUrl);
        return;
      }
      return;
    }
    if ((key.escape || (!key.ctrl && !key.meta)) && completion.handleKey(key)) return;
    if (key.tab) return;
    if (key.escape || (key.ctrl && input === 'c')) {
      session.cancel();
      return;
    }
    if (state.mode === 'pick') {
      if (key.pageUp || key.pageDown) {
        setDetailScroll({
          promptId: state.promptId,
          offset: Math.max(0, Math.min(questionOffset + (key.pageUp ? -questionRows : questionRows), maxOffset)),
        });
      } else if (key.upArrow || input === 'k') session.movePick(-1);
      else if (key.downArrow || input === 'j') session.movePick(1);
      else if (key.return) session.submit();
      else if (/^[1-9]$/.test(input)) {
        const index = Number(input) - 1;
        if (index < state.choices.length) {
          session.movePick(index - state.pickIndex);
          session.submit();
        }
      }
      return;
    }
    if (key.leftArrow) {
      session.moveDraftCursor(-1);
      return;
    }
    if (key.rightArrow) {
      session.moveDraftCursor(1);
      return;
    }
    if (key.upArrow) {
      session.historyPrev();
      return;
    }
    if (key.downArrow) {
      session.historyNext();
      return;
    }
    if (key.return) {
      session.submit();
      return;
    }
    if (key.backspace || key.delete) {
      session.deleteLast();
      return;
    }
    if (!key.ctrl && !key.meta && input) session.insertDraft(input);
  };
  useTerminalInput(
    onInput,
    (wheel) => {
      if (debug || viewDiff || state.mode !== 'pick' || !wheelInside(choicePanel.current, wheel)) return;
      setDetailScroll((previous) => ({
        promptId: state.promptId,
        offset: Math.max(
          0,
          Math.min((previous.promptId === state.promptId ? previous.offset : 0) + wheel.direction * 3, maxOffset),
        ),
      }));
    },
    selection.onPointer,
  );

  const border = color ? 'round' : 'single';
  const accent = color ? (shellMode ? 'yellow' : 'cyan') : undefined;
  const prompt = shellMode ? '!' : glyphs(color).prompt;
  const choiceWidth = Math.max(1, width - 4);
  const selectedRows = Math.max(1, Math.ceil(((state.choices[state.pickIndex]?.length ?? 0) + 5) / choiceWidth));
  const choiceCount = Math.min(state.choices.length, Math.max(1, rows - 10 - (selectedRows - 1)));
  const choiceStart = Math.max(
    0,
    Math.min(state.pickIndex - Math.floor(choiceCount / 2), state.choices.length - choiceCount),
  );
  const questionLines = wrapAnsi(state.question || 'Choose an option', choiceWidth, { hard: true, trim: false }).split(
    '\n',
  );
  const choiceRows = choiceCount + selectedRows - 1;
  const questionRows = Math.min(questionLines.length, Math.max(1, rows - choiceRows - 5));
  const maxOffset = Math.max(0, questionLines.length - questionRows);
  const questionOffset = Math.min(detailScroll.promptId === state.promptId ? detailScroll.offset : 0, maxOffset);
  const suggestionRows = Math.min(completion.suggestions.length, 5, Math.max(0, rows - 9));
  const panelRows =
    suggestionRows +
    (state.mode === 'pick'
      ? choiceRows + questionRows + 2 + Number(maxOffset > 0)
      : state.mode === 'busy'
        ? state.localTask
          ? 6 + Number(Boolean(state.sendStatus))
          : 2
        : 3 + Number(shellMode));
  const live = state.localTask
    ? [`Local task: ${state.localTask}`, 'Studio receives your changes after /submit']
    : state.live;
  const liveRows = Math.min(live.length, Math.max(0, rows - panelRows - 4));
  const footer = `${state.identity || CLI_BIN} · ${CLI_VERSION}`;
  const draft = draftViewport(shellDraft, Math.max(0, state.draftCursor - shellPrefix), width - 5);
  return (
    <ConversationLayout
      lines={state.lines}
      offset={historyOffset}
      color={color}
      split={split}
      width={split ? dimensions.columns : width}
      rows={rows}
      blocked={debug || viewDiff || state.mode === 'pick'}
      hidden={debug || viewDiff}
      hold={alt}
      regions={regions}
      panel={
        panelWidth > 0 ? (
          <WorkspacePanel state={state} changes={changes} rows={rows} width={panelWidth} color={color} />
        ) : undefined
      }
    >
      {debug && readLogs && <TaskDebug read={readLogs} rows={rows} close={() => setDebug(false)} />}
      {viewDiff && newestDiff && (
        <DiffViewer
          diff={newestDiff}
          rows={Math.max(5, rows - 1)}
          columns={width}
          color={color}
          close={() => setViewDiff(false)}
        />
      )}
      <Box flexDirection="column" display={debug || viewDiff ? 'none' : 'flex'}>
        <Box flexDirection="column" height={liveRows} flexShrink={0}>
          {live.slice(0, liveRows).map((line, index) => (
            <Text key={`live:${index}:${line.slice(0, 32)}`} color={color ? 'blue' : undefined} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Box>
        {state.mode === 'busy' ? (
          <BusyPanel
            activity={state.activity}
            since={state.busySince}
            lastOutputAt={state.lastOutputAt}
            color={color}
            previewAvailable={Boolean(state.previewUrl)}
            previewKey={state.localTask ? 'Ctrl+O' : 'o'}
          />
        ) : (
          <Box
            ref={choicePanel}
            flexDirection="column"
            flexShrink={0}
            borderStyle={border}
            borderColor={accent}
            paddingX={1}
          >
            {state.mode === 'pick' ? (
              <>
                <Text bold color={accent}>
                  {questionLines.slice(questionOffset, questionOffset + questionRows).join('\n')}
                </Text>
                {maxOffset > 0 && (
                  <Text dimColor>
                    PgUp/PgDn · {questionOffset + 1}–{questionOffset + questionRows}/{questionLines.length}
                  </Text>
                )}
                {state.choices.slice(choiceStart, choiceStart + choiceCount).map((choice, offset) => {
                  const index = choiceStart + offset;
                  return (
                    <Text
                      wrap={index === state.pickIndex ? 'wrap' : 'truncate-end'}
                      bold={index === state.pickIndex}
                      key={`pick:${index}:${choice}`}
                      color={index === state.pickIndex ? accent : undefined}
                    >
                      {index === state.pickIndex ? '▸ ' : '  '}
                      {index + 1}. {choice}
                    </Text>
                  );
                })}
              </>
            ) : (
              <>
                {shellMode && (
                  <Text bold color={accent}>
                    Shell · local terminal
                  </Text>
                )}
                <Text wrap="truncate-start">
                  <Text color={accent} bold>
                    {prompt}
                  </Text>{' '}
                  {shellMode && !shellDraft ? (
                    <Text dimColor>█Enter a shell command</Text>
                  ) : state.draft ? (
                    <>
                      {draft.hiddenBefore ? '…' : ''}
                      {draft.before}█{draft.after}
                      {draft.hiddenAfter ? '…' : ''}
                    </>
                  ) : (
                    <Text dimColor>What would you like to do? /help</Text>
                  )}
                </Text>
              </>
            )}
          </Box>
        )}
        {state.mode === 'busy' && state.localTask && (
          <Box flexDirection="column" borderStyle={border} borderColor={accent} paddingX={1}>
            <Text dimColor>
              {shellMode
                ? 'Shell after this task'
                : state.canSteer
                  ? 'Message the active agent'
                  : 'Follow-up after this task'}{' '}
              · {state.queued.length} queued
            </Text>
            {state.sendStatus && <Text wrap="truncate-end">{state.sendStatus}</Text>}
            <Text wrap="truncate-start">
              {prompt} {draft.before}█{draft.after}
            </Text>
          </Box>
        )}
        {suggestionRows > 0 && (
          <CommandSuggestions
            suggestions={completion.suggestions}
            selected={completion.selected}
            count={suggestionRows}
            color={color}
          />
        )}
        <Text dimColor wrap="truncate-end">
          {state.mode === 'pick'
            ? `↑↓ select · Enter · Esc · ${state.pickIndex + 1}/${state.choices.length}`
            : state.mode === 'prompt'
              ? completion.suggestions.length
                ? `↑↓ select · Tab fill · Enter ${completion.suggestions[completion.selected]?.command === state.draft ? 'send' : 'fill'} · Esc hide · ${completion.selected + 1}/${completion.suggestions.length}`
                : shellMode
                  ? 'Enter run · Esc exit · ←→ edit'
                  : `Enter · ←→ edit · / commands · ! shell · ↑↓ history · Tab fill${newestDiff ? ' · Ctrl+D diff' : ''}`
              : state.localTask
                ? shellMode
                  ? 'Enter queue · Esc exit · Ctrl+C stop'
                  : state.canSteer
                    ? 'Enter send now · Ctrl+Q queue for later · Ctrl+O preview · Ctrl+L logs · Ctrl+C stop'
                    : 'Enter queue · Ctrl+O preview · Ctrl+L logs · Ctrl+C stop and clear queue'
                : 'Working — input paused'}
        </Text>
        <Text dimColor wrap="truncate-end">
          <RichText
            text={
              split
                ? `${selection.notice || (mouse ? 'Drag to copy · wheel / PgUp/PgDn chat' : 'PgUp/PgDn chat')} · Ctrl+B hide sidebar · ${footer}`
                : `${canSplit ? 'Ctrl+B show sidebar · ' : ''}${footer}`
            }
            color={color}
          />
        </Text>
      </Box>
    </ConversationLayout>
  );
}
