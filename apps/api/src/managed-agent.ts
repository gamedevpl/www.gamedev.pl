// Vendor-neutral seam for hosted coding-agent platforms.
import type { AgentTaskState } from './agent-tasks.js';

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
  listOutputs(sessionId: string): Promise<ManagedOutputFile[]>;
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

// A pull has no ceiling; this is it.
export function assertWithinManagedOutputCaps(
  files: ManagedOutputFile[],
  caps: ManagedOutputCaps = DEFAULT_MANAGED_OUTPUT_CAPS,
): ManagedOutputFile[] {
  if (files.length > caps.maxFiles) {
    throw new ManagedOutputRejectedError(`too many output files: ${files.length} > ${caps.maxFiles}`);
  }
  let total = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > caps.maxFileBytes) {
      throw new ManagedOutputRejectedError(`output file too large: ${file.path} is ${bytes} bytes`);
    }
    total += bytes;
    if (total > caps.maxTotalBytes) {
      throw new ManagedOutputRejectedError(`output too large: over ${caps.maxTotalBytes} bytes`);
    }
  }
  return files;
}

// Strips games/<slug>/ so harvests match delivery paths.
export function toGameRelativeOutputs(files: ManagedOutputFile[], slug: string): ManagedOutputFile[] {
  const prefix = `games/${slug}/`;
  const inside: ManagedOutputFile[] = [];
  for (const file of files) {
    const path = file.path.replace(/^\.\//, '');
    if (path.startsWith(prefix)) {
      inside.push({ path: path.slice(prefix.length), content: file.content });
      continue;
    }
    // Another game's directory is never this round's deliverable.
    if (!path.startsWith('games/')) inside.push({ path, content: file.content });
  }
  return inside.filter((file) => file.path.length > 0);
}

export interface ManagedProviderConfig {
  apiKey: string;
  model: string;
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
