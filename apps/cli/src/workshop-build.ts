import { gameSourceRoot, gameSourcePath, sourceProject } from './source-project.js';
import { PROGRESS_INSTRUCTIONS } from './local-progress.js';
import { startWorkshopPreview } from './local-preview-tools.js';
import { runPermissionTask, claudeLocalFlags } from './permission-task.js';
import { permissionHandoff } from './permission-handoff.js';
import { applyPermissionMode, permissionLabel, taskPermissionMode } from './agent-permissions.js';
import { prepareAgyPermissions } from './agy-permissions.js';
import { localActivity } from './local-activity.js';
import { agyConversation } from './agy-interactive.js';
import { taskOutput } from './task-output.js';
import { configureAdapter, selectionLabel } from './agent-settings.js';
import { trackAgentFailure } from './agent-failure.js';
import { requireClaudeSubscription, subscriptionEnv } from './claude-auth.js';
import { permissionBlocked } from './agent-events.js';
import { preflightAdapter, type AdapterSpec } from './adapters.js';
import { changedPaths, localGameFiles, type TreeFile } from './checkout.js';
import { childEnv } from './delegate.js';
import { createEventRenderer } from './agent-render.js';
import { formatError } from './errors.js';
import { repairLoop } from './repair-loop.js';
import { runLadderAsync } from './verify.js';
import { prepareWorkspace } from './prepare-workspace.js';
import type { Workshop } from './workshop.js';

export async function runLocalBuild(input: {
  ws: Workshop;
  spec: AdapterSpec;
  brief: string;
  baseline?: TreeFile[];
  merge?: { complete: () => Promise<void>; hasResult: () => boolean };
  write: (line: string) => void;
}): Promise<boolean> {
  const { ws } = input;
  const spec = configureAdapter(input.spec, ws.env);
  const output = taskOutput(input.write, ws.onActivity);
  ws.lastLog = output.path;
  input = { ...input, write: output.write };
  input.write(`\n── ${ws.slug} · local task ──`);
  const mode = taskPermissionMode(spec, ws.permissionMode);
  input.write(`${selectionLabel(spec.name, spec.selection ?? {})} · permissions: ${permissionLabel(mode)}`);
  input.write(ws.unattended ? `Full transcript: ${output.path}` : 'Settings: /model · full transcript: /logs');
  ws.onActivity?.(`Preparing ${spec.name}`);
  if (!ws.runAdapter) preflightAdapter(spec, ws.env);
  const cwd = !input.merge && spec.cwd === 'game-dir' ? gameSourceRoot(ws.root, ws.slug) : ws.root;
  const controller = new AbortController();
  const permitted = applyPermissionMode(spec, mode);
  ws.abort.current = controller;
  let presence: ReturnType<typeof localActivity> | undefined;
  let success = false;
  let mergePrepared = false;
  const captureBudget = { used: 0 };
  const permissionState = { mode };
  let authCheck: Promise<void> | undefined;
  try {
    // Auto-approve and YOLO skip agy prompts; the preset is moot.
    if (mode === 'ask' && !(await prepareAgyPermissions(ws, spec.name, input.write, controller.signal))) return false;
    if (!ws.runAdapter && spec.name === 'claude') {
      authCheck = requireClaudeSubscription({
        command: spec.command,
        cwd,
        env: subscriptionEnv(childEnv(ws.env, '')),
        args: [...claudeLocalFlags(ws.root, cwd), ...permitted.spec.headless],
        abort: controller.signal,
      });
      await authCheck;
    }
    presence = localActivity(ws.activityApi, ws.token, spec.name);
    ws.onLocalTask?.(spec.name);
    input.write(`▸ Preparing ${spec.name} in ${gameSourcePath(ws.root, ws.slug)} — Ctrl+C stops it`);
    if (!ws.runAdapter && !input.merge) {
      input.write('Preparing Creator Kit and dependencies…');
      output.preparing(true);
      try {
        await prepareWorkspace({ cwd: ws.root, env: ws.env, abort: controller.signal, write: input.write });
      } finally {
        output.preparing(false);
      }
    }
    let previewUrl: string | undefined;
    if (!ws.runAdapter && !ws.unattended && !input.merge) {
      try {
        previewUrl = await startWorkshopPreview({
          root: ws.root,
          slug: ws.slug,
          env: ws.env,
          write: input.write,
          abort: controller.signal,
          agent: spec.name,
          onLocalPreview: ws.onLocalPreview,
        });
      } catch (error) {
        input.write(formatError(error));
      }
    }
    if (controller.signal.aborted) return false;
    ws.onActivity?.(`${spec.name} is editing locally — input returns when it finishes`);
    input.write(`${spec.name} controls this local editing task; Ctrl+C stops it.`);
    if (spec.name === 'claude')
      input.write(
        'Claude uses subscription login; API authentication is refused. This local task is not linked to Claude Desktop.',
      );
    ws.telemetry?.record('delegate_used', { adapter: spec.name });
    success = await repairLoop({
      brief: `${input.brief}\n${PROGRESS_INSTRUCTIONS}\n${previewUrl ? `The CLI already started this live preview: ${previewUrl}. Use this exact URL for visual checks with an available browser tool or permitted local browser automation. Do not start or stop another preview server. Browser unavailability must not stop implementation.` : 'No live preview was supplied. Continue implementation without visual verification; report that limitation. The creator can start /play in their terminal.'}`,
      abort: controller.signal,
      activity: (text) => ws.onActivity?.(text),
      write: input.write,
      failed: (stage) => ws.telemetry?.record('verify_failed', { adapter: spec.name, stage }),
      verify: async () => {
        await input.merge?.complete();
        if (input.merge && !ws.runAdapter && !mergePrepared && !sourceProject(ws.root)) {
          await prepareWorkspace({ cwd: ws.root, env: ws.env, abort: controller.signal, write: input.write });
          mergePrepared = true;
        }
        presence?.phase('verifying');
        return runLadderAsync({
          cwd: ws.root,
          slug: ws.slug,
          run: ws.run,
          abort: controller.signal,
          onStage: (message) => {
            if (message.startsWith('Warning:')) input.write(message);
          },
        });
      },
      run: async (prompt) => {
        presence?.phase('editing');
        const before = localGameFiles(ws.root, ws.slug);
        const render = createEventRenderer(spec.name);
        let failure = trackAgentFailure(spec.name);
        let blocked = false;
        let conversation: string | undefined;
        const result = await runPermissionTask({
          ws,
          permissionState,
          previewUrl,
          captureBudget,
          output,
          write: input.write,
          onRestart: () => {
            blocked = false;
            failure = trackAgentFailure(spec.name);
          },
          spec,
          prompt,
          authCheck,
          onSteering: ws.unattended ? undefined : ws.onSteering,
          cwd,
          abort: controller.signal,
          onDiagnostic: output.raw,
          onLine: (line) => {
            output.raw(line);
            conversation = agyConversation(line) ?? conversation;
            if (permissionBlocked(line)) blocked = true;
            for (const shown of render.line(line)) input.write(shown);
          },
          onEvent: (event) => {
            failure.observe(event);
            if (event.type === 'error' && event.message.startsWith('Muse needs your approval'))
              ws.onActivity?.('Muse needs your approval');
            for (const shown of render.event(event)) input.write(shown);
          },
        });
        for (const shown of render.flush()) input.write(shown);
        if (controller.signal.aborted) return false;
        let handedOff = false;
        if (result.permissionSession || (blocked && spec.name === 'agy' && ws.interactiveRun && !ws.unattended)) {
          handedOff = await permissionHandoff({
            ws,
            spec,
            cwd,
            prompt,
            conversation: result.permissionSession ?? conversation,
            write: input.write,
            abort: controller.signal,
            phase: (phase) => presence?.phase(phase),
          });
          if (!handedOff) return false;
        }
        if (blocked && !handedOff) {
          input.write(
            `${spec.name} could not obtain tool permissions in headless mode. No successful edit is confirmed; review its permissions for this game directory and retry.`,
          );
          return false;
        }
        if (!handedOff && (result.code ?? 1) !== 0) {
          input.write(
            formatError(
              failure.error(
                result.code,
                ws.unattended
                  ? '/diff to review partial edits, then rerun the delegate command'
                  : '/diff to review partial edits, then /retry to resume this task',
              ),
            ),
          );
          return false;
        }
        if (
          changedPaths(input.baseline ?? before, localGameFiles(ws.root, ws.slug)).length === 0 &&
          !input.merge?.hasResult()
        ) {
          input.write(
            'No game files changed. Task completion is not confirmed; static checks and delivery were skipped.',
          );
          input.write(
            'Review the agent output for the task result or reported blocker. /diff shows existing local edits; /push delivers them explicitly.',
          );
          return false;
        }
        return true;
      },
    });
    return success;
  } finally {
    ws.onSteering?.(undefined);
    output.flush();
    await presence?.finish(controller.signal.aborted ? 'stopped' : success ? 'ready' : 'failed');
    if (controller.signal.aborted) input.write(`${spec.name} stopped — the tree keeps whatever it wrote; /diff to see`);
    ws.abort.current = null;
    ws.onLocalTask?.('');
  }
}
