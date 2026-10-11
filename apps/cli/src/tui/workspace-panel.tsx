import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { sanitizePath, stripTerminalControls } from '../ansi.js';
import type { TuiState } from './session.js';
import { readWorkspaceChanges, type WorkspaceChanges, type WorkspaceCheckout } from './workspace-status.js';

export function useWorkspaceChanges(checkout: WorkspaceCheckout | null, visible: boolean): WorkspaceChanges {
  const root = checkout?.root;
  const slug = checkout?.slug;
  const [snapshot, setSnapshot] = useState<{ root?: string; slug?: string; changes: WorkspaceChanges }>({
    changes: { kind: 'no_checkout', files: [] },
  });
  useEffect(() => {
    if (!visible) return;
    const refresh = () =>
      setSnapshot({ root, slug, changes: readWorkspaceChanges(root && slug ? { root, slug } : null) });
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [root, slug, visible]);
  return snapshot.root === root && snapshot.slug === slug
    ? snapshot.changes
    : { kind: root ? 'unavailable' : 'no_checkout', files: [] };
}

export function WorkspacePanel({
  state,
  changes,
  rows,
  width,
  color,
}: {
  state: TuiState;
  changes: WorkspaceChanges;
  rows: number;
  width: number;
  color: boolean;
}) {
  const heading = color ? 'cyan' : undefined;
  const task = state.approvalPending
    ? 'Approval required'
    : state.mode === 'pick'
      ? 'Waiting for your choice'
      : state.mode === 'busy'
        ? state.localTask
          ? `Local agent: ${state.localTask}`
          : state.activity
        : 'Ready for your next request';
  const remote = state.localTask ? ['Delivery happens after /submit'] : state.live.slice(0, 3);
  const detail =
    changes.kind === 'no_checkout'
      ? 'Open a checkout with /checkout'
      : changes.kind === 'no_base'
        ? 'No baseline · use /status'
        : changes.kind === 'unavailable'
          ? 'Files unavailable · retrying'
          : changes.files.length
            ? 'Compared with last checkout base'
            : 'No local changes';
  const fileRows = Math.max(0, rows - 13 - remote.length);
  const shown = changes.files.slice(0, fileRows);
  const hidden = changes.files.length - shown.length;
  return (
    <Box
      width={width}
      height={rows}
      flexShrink={0}
      flexDirection="column"
      borderStyle="single"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      paddingLeft={2}
      paddingRight={1}
      overflow="hidden"
    >
      <Text bold color={heading}>
        WORKSPACE
      </Text>
      <Text wrap="truncate-end" bold>
        {stripTerminalControls(task)}
      </Text>
      <Text dimColor wrap="truncate-end">
        {state.queued.length} queued · {state.previewUrl ? 'Preview ready' : 'No preview yet'}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold color={heading}>
          STUDIO
        </Text>
        {(remote.length ? remote : ['No round status yet']).map((line, index) => (
          <Text key={index} wrap="truncate-end">
            {stripTerminalControls(line)}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        <Text bold color={heading}>
          LOCAL CHANGES{changes.kind === 'ready' ? ` · ${changes.files.length}` : ''}
        </Text>
        <Text dimColor wrap="truncate-end">
          {detail}
        </Text>
        {changes.version && (
          <Text dimColor wrap="truncate-end">
            Base: {sanitizePath(changes.version)}
          </Text>
        )}
        {shown.map((file) => (
          <Text
            key={file.path}
            wrap="truncate-middle"
            color={color ? (file.kind === 'deleted' ? 'red' : file.kind === 'added' ? 'green' : 'yellow') : undefined}
          >
            {file.kind === 'deleted' ? 'D' : file.kind === 'added' ? 'A' : 'M'} {sanitizePath(file.path)}
          </Text>
        ))}
        {hidden > 0 && <Text dimColor>+{hidden} more · /status</Text>}
      </Box>
      <Text dimColor wrap="truncate-end">
        /diff inspect · /submit deliver
      </Text>
      <Text dimColor wrap="truncate-end">
        PgUp/PgDn chat · Ctrl+B sidebar
      </Text>
    </Box>
  );
}
