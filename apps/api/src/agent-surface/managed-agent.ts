// Vendor-neutral seam for hosted coding-agent platforms.
import type { AgentTaskState } from '../creation/agent-state.js';

// Coarse reasoning budget; vendors name it differently.
export type ManagedAgentEffort = 'low' | 'medium' | 'high';

export interface ManagedWorkspaceFile {
  path: string;
  content: string;
}

export interface ManagedTokenUsageBase {
  unit: 'tokens';
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export interface ManagedTokenUsage extends ManagedTokenUsageBase {
  vendor: string;
}

export interface ManagedGeminiTokenUsage extends ManagedTokenUsageBase {
  vendor: 'gemini';
  model: string;
  totalTokens: number;
  thoughtTokens: number;
  cachedTokens: number;
  toolUseTokens: number;
}

export interface ManagedOpenAiTokenUsage extends ManagedTokenUsageBase {
  vendor: 'openai';
  model: string;
  totalTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
}

export interface ManagedCreditUsage {
  unit: 'credits';
  vendor: string;
  credits: number;
  model?: string;
}

export type ManagedSessionUsage =
  ManagedTokenUsage | ManagedGeminiTokenUsage | ManagedOpenAiTokenUsage | ManagedCreditUsage;

export type ManagedUsageBudget =
  { unit: 'tokens'; max: number } | { unit: 'credits'; max: number } | { unit: 'cents'; max: number };

export interface ManagedBudgetStop {
  unit: ManagedUsageBudget['unit'];
  observed: number;
  max: number;
  enforced: boolean;
}

export interface ManagedSession {
  id: string;
  state: AgentTaskState;
  credentialRef?: string;
  workspace?: string;
  // The vendor's own word, kept for operator views.
  vendorState?: string;
  usage?: ManagedSessionUsage;
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

export interface ManagedMcpBearerCredential {
  url: string;
  token: string;
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
  maxDurationSeconds?: number;
  tools?: ManagedToolAccess;
  mcpBearerCredential?: ManagedMcpBearerCredential;
}

export interface ManagedAgentProvider {
  readonly vendor: string;
  readonly model: string;
  // Whether startSession accepts workspaceFiles.
  readonly supportsSeedFiles?: boolean;
  startSession(request: ManagedSessionRequest): Promise<ManagedSession>;
  getSession(sessionId: string): Promise<ManagedSession | null>;
  sendMessage?(sessionId: string, message: string): Promise<void>;
  cancelSession(sessionId: string): Promise<{ enforced: boolean }>;
  deleteSession?(sessionId: string): Promise<void>;
  deleteWorkspace?(workspace: string): Promise<void>;
  releaseCredential?(credentialRef: string): Promise<void>;
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
  ended: 'completed',
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
  incomplete: 'completed',
  budget_exceeded: 'completed',
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

export interface ManagedProviderConfig {
  apiKey: string;
  model: string;
  budget?: ManagedUsageBudget;
  // Copilot: the scratch repo MCP-lane rounds dispatch into.
  mcpRepo?: string;
  mcpBaseRef?: string;
  mcpCustomAgent?: string;
  agentId?: string;
  environmentId?: string;
  maxListCostCents?: number;
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
