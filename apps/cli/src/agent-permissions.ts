import { applyPermissionArgs, decideApproval, type AgentTask, type AgentPermissions } from 'genaicode/agents';
import type { AdapterSpec } from './adapters.js';
import { approvalPrompt, type ApproveTool } from './agent-approval.js';
import { clearCommandApprovals, commandApprovalMemory } from './agent-approval-memory.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';
import type { Workshop } from './workshop.js';

// Default Auto falls back to Ask when sandbox translation is unsupported.
export type PermissionMode = 'ask' | 'auto' | 'yolo';
export const PERMISSION_MODES: readonly PermissionMode[] = ['ask', 'auto', 'yolo'];

const LABELS: Record<PermissionMode, string> = {
  ask: 'Ask',
  auto: 'Auto-approve (sandboxed)',
  yolo: 'YOLO (full access, no questions)',
};

let current: PermissionMode | undefined;

export function permissionMode(): PermissionMode {
  return current ?? 'auto';
}

export function setPermissionMode(mode?: PermissionMode): void {
  current = mode;
}

export function permissionEnvironment(): Record<string, string> {
  return { [PERMISSIONS_ENV]: current ?? '' };
}

export function taskPermissionMode(spec: AdapterSpec, override?: PermissionMode): PermissionMode {
  if (override || current) return override ?? current!;
  try {
    applyPermissionMode(spec, 'auto');
    return 'auto';
  } catch {
    return 'ask';
  }
}

export function permissionLabel(mode: PermissionMode): string {
  return LABELS[mode];
}

export function parsePermissionMode(value: string): PermissionMode {
  const mode = value === 'auto-approve' ? 'auto' : value;
  if ((PERMISSION_MODES as readonly string[]).includes(mode)) return mode as PermissionMode;
  throw new CliError(`unknown permission mode ${value}`, EXIT_INPUT, 'use ask, auto or yolo');
}

// The Play worker inherits the launching process's mode through this variable.
export const PERMISSIONS_ENV = 'GAMEDEVPL_PERMISSIONS';

// `--permissions <mode>`, or the mode a Play worker was started with.
export function choosePermissionMode(flag: string | boolean | undefined, env: NodeJS.ProcessEnv): void {
  if (flag === true) throw new CliError('--permissions needs a mode', EXIT_INPUT, 'ask, auto or yolo');
  const value = typeof flag === 'string' ? flag : env[PERMISSIONS_ENV];
  setPermissionMode(value ? parsePermissionMode(value) : undefined);
}

// Ask keeps each adapter's own flags and the creator's prompts.
export function modePermissions(mode: PermissionMode): AgentTask['permissions'] {
  if (mode === 'auto') return { approval: 'auto-approve', sandbox: 'workspace-write' } satisfies AgentPermissions;
  return mode === 'yolo' ? 'yolo' : undefined;
}

// Muse translates in its live session, not through flags.
export function applyPermissionMode(
  spec: AdapterSpec,
  mode: PermissionMode,
): { spec: AdapterSpec; env: Record<string, string> } {
  const permissions = modePermissions(mode);
  if (!permissions || spec.name === 'muse') {
    if (permissions && spec.name === 'muse' && mode === 'auto') refuse(spec.name, mode, 'Muse has no sandbox');
    return { spec, env: {} };
  }
  try {
    const applied = applyPermissionArgs(spec.name, spec.headless, permissions);
    return { spec: { ...spec, headless: applied.args }, env: applied.env };
  } catch (error) {
    return refuse(spec.name, mode, (error as Error).message);
  }
}

function refuse(agent: string, mode: PermissionMode, reason: string): never {
  throw new CliError(
    `${agent} cannot run in ${permissionLabel(mode)} mode: ${reason}`,
    EXIT_INPUT,
    '/permissions ask, or pick another agent',
  );
}

// Approves per policy and says so; nothing goes to analytics.
export function autoApproval(agent: string, mode: PermissionMode, write: (line: string) => void): ApproveTool {
  const permissions = modePermissions(mode);
  return async (request, signal) => {
    const { decision } = await decideApproval({ permissions }, request, signal ?? new AbortController().signal);
    const what = request.summary ? `: ${request.summary}` : '';
    write(`${agent}: ${decision === 'approve' ? 'auto-approved' : 'denied'} ${request.kind}${what}`);
    return decision;
  };
}

// One task's flags, env and approval handler for the active mode.
export function taskPermissions(input: {
  spec: AdapterSpec;
  mode: PermissionMode;
  cwd: string;
  ws: Pick<Workshop, 'unattended' | 'pick' | 'onActivity' | 'permissionMode'>;
  signal: AbortSignal;
  write: (line: string) => void;
  autoResume?: { available: () => boolean; start: () => void };
}): {
  spec: AdapterSpec;
  env: Record<string, string>;
  onApproval: ApproveTool | undefined;
  permissions: AgentTask['permissions'];
} {
  const applied = applyPermissionMode(input.spec, input.mode);
  const agent = input.spec.name;
  const { ws, signal, write } = input;
  const ask = ws.unattended
    ? undefined
    : approvalPrompt({
        agent,
        pick: ws.pick,
        signal,
        write,
        activity: ws.onActivity,
        cwd: input.cwd,
        remembered: commandApprovalMemory(ws),
        autoResume:
          agent === 'claude' && input.autoResume
            ? {
                available: input.autoResume.available,
                start: () => {
                  setPermissionMode('auto');
                  delete ws.permissionMode;
                  input.autoResume!.start();
                },
              }
            : undefined,
        autoNextAvailable: () => (ws.permissionMode ?? permissionMode()) !== 'auto',
        autoNext:
          agent === 'claude' && (ws.permissionMode ?? permissionMode()) !== 'auto'
            ? () => {
                setPermissionMode('auto');
                delete ws.permissionMode;
                write('Permissions: Auto-approve (sandboxed) for next tasks. This task stays in Ask.');
              }
            : undefined,
      });
  return {
    ...applied,
    onApproval: input.mode === 'ask' ? ask : autoApproval(agent, input.mode, input.write),
    permissions: modePermissions(input.mode),
  };
}

// `permissions [mode]`: show or switch this process's mode.
export async function permissionsCommand(input: {
  args: string[];
  pick?: (choices: string[], question: string) => Promise<string>;
  write: (line: string) => void;
}): Promise<void> {
  let value = input.args[0];
  if (!value && input.pick) {
    const labels = PERMISSION_MODES.map(permissionLabel);
    const chosen = await input.pick(labels, `Agent permissions (now: ${permissionLabel(permissionMode())})`);
    value = PERMISSION_MODES[labels.indexOf(chosen)];
  }
  if (value) {
    setPermissionMode(parsePermissionMode(value));
    if (current === 'ask') {
      clearCommandApprovals();
      input.write('Remembered command approvals cleared.');
    }
  }
  input.write(`Permissions: ${permissionLabel(permissionMode())}`);
  if (!current) input.write('Agents without a supported sandbox use Ask.');
  if (current === 'yolo') input.write('YOLO: agents run without a sandbox and nothing asks you first.');
  if (!value) input.write('permissions ask|auto|yolo; --permissions <mode> sets it for one run');
}
