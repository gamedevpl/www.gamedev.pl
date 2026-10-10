import { realpathSync } from 'node:fs';
import type { AdapterRunInput } from './headless-agent.js';
import type { Workshop } from './workshop.js';
import { defaultAdapterRun } from './workshop-runner.js';
import { taskPermissions, permissionMode } from './agent-permissions.js';
import { approvalEnv } from './agent-approval.js';
import { childEnv } from './delegate.js';
import { localPreviewTools, LOCAL_PREVIEW_INSTRUCTIONS } from './local-preview-tools.js';
import type { taskOutput } from './task-output.js';

export function claudeAbsolutePath(path: string): string {
  const posix = path.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`);
  return `/${posix.replace(/\/+$/, '')}`;
}

export function claudeLocalFlags(root: string, cwd: string): string[] {
  const readRoot = { permissions: { allow: [`Read(${claudeAbsolutePath(realpathSync(root))}/**)`] } };
  return [
    ...(cwd === root ? [] : ['--settings', JSON.stringify(readRoot)]),
    '--strict-mcp-config',
    '--setting-sources',
    'project,local',
  ];
}

// Restart only after the old process and its MCP endpoint finish.
export async function runPermissionTask(
  input: Omit<AdapterRunInput, 'env' | 'permissions' | 'onApproval'> & {
    ws: Workshop;
    previewUrl?: string;
    captureBudget?: { used: number };
    output: ReturnType<typeof taskOutput>;
    write: (line: string) => void;
    onRestart: () => void;
  },
) {
  const { ws } = input;
  let resume: string | undefined;
  for (;;) {
    if (input.abort?.aborted) return { code: 1 };
    const switching = new AbortController();
    const signal =
      input.spec.name === 'claude'
        ? input.abort
          ? AbortSignal.any([input.abort, switching.signal])
          : switching.signal
        : (input.abort ?? switching.signal);
    let session: string | undefined;
    let restart = false;
    const permitted = taskPermissions({
      ws,
      spec: input.spec,
      mode: ws.permissionMode ?? permissionMode(),
      cwd: input.cwd,
      signal,
      write: input.write,
      autoResume: {
        available: () => Boolean(session),
        start: () => {
          restart = true;
          switching.abort();
        },
      },
    });
    const tools = await localPreviewTools({
      spec: permitted.spec,
      onApproval: input.spec.name === 'claude' ? permitted.onApproval : undefined,
      sandbox: { permissions: permitted.permissions, cwd: input.cwd },
      previewUrl: input.previewUrl,
      captureBudget: input.captureBudget,
      abort: signal,
      write: input.write,
      progress: input.output.progress,
    });
    try {
      if (signal.aborted) return { code: 1 };
      let spec = tools?.spec ?? permitted.spec;
      if (spec.name === 'claude')
        spec = {
          ...spec,
          headless: [
            ...claudeLocalFlags(ws.root, input.cwd),
            ...spec.headless,
            ...(resume ? ['--resume', resume] : []),
          ],
        };
      const prompt = [
        input.prompt,
        ...(resume
          ? [
              'Continue this unfinished request in the resumed conversation. Keep existing edits and completed work; do not repeat completed actions. The pending tool was not approved before restarting.',
            ]
          : []),
        ...(tools && input.previewUrl ? [LOCAL_PREVIEW_INSTRUCTIONS] : []),
      ].join('\n');
      const result = await (ws.runAdapter ?? defaultAdapterRun)({
        spec,
        cwd: input.cwd,
        authCheck: input.authCheck,
        onSteering: input.onSteering,
        onLine: input.onLine,
        onDiagnostic: input.onDiagnostic,
        prompt,
        env: { ...approvalEnv(childEnv(ws.env, ''), tools?.approvals), ...permitted.env },
        abort: signal,
        onApproval: permitted.onApproval,
        permissions: permitted.permissions,
        onEvent: (event) => {
          if (event.type === 'session') session = event.sessionId;
          if (!restart) input.onEvent?.(event);
        },
      });
      if (!restart || input.abort?.aborted) return result;
    } finally {
      await tools?.close();
    }
    if (input.abort?.aborted) return { code: 1 };
    resume = session;
    input.onRestart();
    input.write('Permissions: Auto-approve (sandboxed). Resuming the same Claude conversation; local edits are kept.');
    ws.onActivity?.('Resuming Claude in Auto');
  }
}
