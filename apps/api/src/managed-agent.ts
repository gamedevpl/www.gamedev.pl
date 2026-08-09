// Vendor-neutral seam for hosted coding-agent platforms.
import type { AgentTaskState } from './agent-state.js';

// Coarse reasoning budget; vendors name it differently.
export type ManagedAgentEffort = 'low' | 'medium' | 'high';

export interface ManagedWorkspaceFile {
  path: string;
  content: string;
}

export interface ManagedOutputFile {
  path: string;
  content: string;
}

// Listed before anything is downloaded, so caps can refuse first.
export interface ManagedOutputRef {
  path: string;
  sizeBytes?: number;
  // Opaque vendor handle; nothing outside the provider reads it.
  handle?: string;
}

// Tokens: the only unit every vendor reports.
export interface ManagedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export interface ManagedSession {
  id: string;
  state: AgentTaskState;
  // The vendor's own word, kept for operator views.
  vendorState?: string;
  usage?: ManagedTokenUsage;
  startedAt?: string;
  endedAt?: string;
  stopReason?: string;
}

export interface ManagedToolAccess {
  mcpEndpoints?: { url: string; name?: string }[];
  allowedHosts?: string[];
  // Names only: the sandbox must never see credential values.
  credentialNames?: string[];
}

export interface ManagedSessionRequest {
  correlationId: string;
  // Cacheable prefix shared across sessions of one agent version.
  systemPrompt?: string;
  prompt: string;
  // Never defaulted by the vendor: unattributable runs cannot be compared.
  model: string;
  effort?: ManagedAgentEffort;
  workspaceFiles?: ManagedWorkspaceFile[];
  outputPath: string;
  maxDurationSeconds?: number;
  tools?: ManagedToolAccess;
}

export interface ManagedAgentProvider {
  readonly vendor: string;
  readonly model: string;
  startSession(request: ManagedSessionRequest): Promise<ManagedSession>;
  getSession(sessionId: string): Promise<ManagedSession | null>;
  // Paths are relative to the request's outputPath.
  listOutputs(sessionId: string): Promise<ManagedOutputRef[]>;
  // One at a time; the caller decides how many.
  readOutput(sessionId: string, ref: ManagedOutputRef): Promise<string>;
  sendMessage?(sessionId: string, message: string): Promise<void>;
  cancelSession(sessionId: string): Promise<{ enforced: boolean }>;
  deleteSession?(sessionId: string): Promise<void>;
}

export class ManagedAgentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ManagedAgentError';
  }
}

export class ManagedOutputRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedOutputRejectedError';
  }
}

const STATE_ALIASES: Record<string, AgentTaskState> = {
  queued: 'queued',
  pending: 'queued',
  created: 'queued',
  scheduled: 'queued',
  starting: 'queued',
  running: 'in_progress',
  in_progress: 'in_progress',
  active: 'in_progress',
  working: 'in_progress',
  idle: 'idle',
  status_idle: 'idle',
  paused: 'idle',
  completed: 'completed',
  complete: 'completed',
  succeeded: 'completed',
  success: 'completed',
  finished: 'completed',
  failed: 'failed',
  error: 'failed',
  errored: 'failed',
  timed_out: 'timed_out',
  timeout: 'timed_out',
  expired: 'timed_out',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  aborted: 'cancelled',
  stopped: 'cancelled',
  waiting_for_user: 'waiting_for_user',
  needs_input: 'waiting_for_user',
  awaiting_input: 'waiting_for_user',
  rescheduling: 'in_progress',
  terminated: 'failed',
};

// Unknown words read as in_progress, never failed.
export function normalizeManagedState(raw: string | undefined | null): AgentTaskState {
  if (!raw) return 'queued';
  return STATE_ALIASES[raw.trim().toLowerCase()] ?? 'in_progress';
}

export function isManagedSessionSettled(state: AgentTaskState): boolean {
  return state === 'completed' || state === 'failed' || state === 'timed_out' || state === 'cancelled';
}

// Idle counts: runtimes park finished agents.
export function isManagedSessionHarvestable(state: AgentTaskState): boolean {
  return state === 'idle' || isManagedSessionSettled(state);
}

export interface ManagedOutputCaps {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

// Sized to one game, not a sandbox.
export const DEFAULT_MANAGED_OUTPUT_CAPS: ManagedOutputCaps = {
  maxFiles: 60,
  maxTotalBytes: 2_000_000,
  maxFileBytes: 1_000_000,
};

// Spends the byte budget per file, so a download loop stops early.
export function createManagedOutputBudget(caps: ManagedOutputCaps = DEFAULT_MANAGED_OUTPUT_CAPS) {
  let total = 0;
  let count = 0;
  return {
    admit(path: string, content: string): ManagedOutputFile {
      count += 1;
      if (count > caps.maxFiles) {
        throw new ManagedOutputRejectedError(`too many output files: ${count} > ${caps.maxFiles}`);
      }
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > caps.maxFileBytes) {
        throw new ManagedOutputRejectedError(`output file too large: ${path} is ${bytes} bytes`);
      }
      total += bytes;
      if (total > caps.maxTotalBytes) {
        throw new ManagedOutputRejectedError(`output too large: over ${caps.maxTotalBytes} bytes`);
      }
      return { path, content };
    },
  };
}

// A pull has no ceiling; this is it.
export function assertWithinManagedOutputCaps(
  files: ManagedOutputFile[],
  caps: ManagedOutputCaps = DEFAULT_MANAGED_OUTPUT_CAPS,
): ManagedOutputFile[] {
  if (files.length > caps.maxFiles) {
    throw new ManagedOutputRejectedError(`too many output files: ${files.length} > ${caps.maxFiles}`);
  }
  const budget = createManagedOutputBudget(caps);
  for (const file of files) budget.admit(file.path, file.content);
  return files;
}

// What to download, and where it lands in the game.
export interface ManagedOutputPlan {
  ref: ManagedOutputRef;
  path: string;
}

// Refused on the listing, before a byte is fetched.
export function assertWithinManagedOutputPlan(
  plan: ManagedOutputPlan[],
  caps: ManagedOutputCaps = DEFAULT_MANAGED_OUTPUT_CAPS,
): ManagedOutputPlan[] {
  if (plan.length > caps.maxFiles) {
    throw new ManagedOutputRejectedError(`too many output files: ${plan.length} > ${caps.maxFiles}`);
  }
  let known = 0;
  for (const entry of plan) {
    const bytes = entry.ref.sizeBytes;
    if (bytes === undefined) continue;
    if (bytes > caps.maxFileBytes) {
      throw new ManagedOutputRejectedError(`output file too large: ${entry.path} is ${bytes} bytes`);
    }
    known += bytes;
    if (known > caps.maxTotalBytes) {
      throw new ManagedOutputRejectedError(`output too large: over ${caps.maxTotalBytes} bytes`);
    }
  }
  return plan;
}

// What the harvest ignored, so an empty round can explain itself.
export interface ManagedOutputSelection {
  plan: ManagedOutputPlan[];
  ignored: string[];
}

// Only games/<slug>/ is a delivery; see docs/build-brief.md.
export function selectManagedOutputs(refs: readonly ManagedOutputRef[], slug: string): ManagedOutputSelection {
  const prefix = `games/${slug}/`;
  const plan: ManagedOutputPlan[] = [];
  const ignored: string[] = [];
  for (const ref of refs) {
    const path = ref.path.replace(/^\.\//, '');
    if (
      !path ||
      path.includes('\0') ||
      path.includes('\\') ||
      path.startsWith('/') ||
      /^[A-Za-z]:\//.test(path) ||
      path.split('/').includes('..')
    ) {
      throw new ManagedOutputRejectedError(`unsafe output path: ${ref.path}`);
    }
    // The brief names one directory; the rest is the sandbox's business.
    const relative = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (relative) plan.push({ ref, path: relative });
    else ignored.push(path);
  }
  return { plan, ignored };
}

export interface ManagedProviderConfig {
  apiKey: string;
  model: string;
  agentId?: string;
  environmentId?: string;
  maxListBudgetUsd?: number;
  vaultIds?: string[];
  // Replace the agent's own tools and servers; off, its config wins.
  overrideTools?: boolean;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ManagedProviderFactory = (config: ManagedProviderConfig) => ManagedAgentProvider;

const factories = new Map<string, ManagedProviderFactory>();

// Adding a vendor costs one registration line.
export function registerManagedProvider(vendor: string, factory: ManagedProviderFactory): void {
  factories.set(vendor, factory);
}

export function managedProviderVendors(): string[] {
  return [...factories.keys()].sort();
}

export function createManagedProvider(vendor: string, config: ManagedProviderConfig): ManagedAgentProvider {
  const factory = factories.get(vendor);
  if (!factory) {
    const known = managedProviderVendors().join(', ') || '(none registered)';
    throw new ManagedAgentError(`unknown managed agent vendor "${vendor}" — registered: ${known}`);
  }
  return factory(config);
}
