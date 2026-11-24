import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { ToolResult } from './mcp-tool-support.js';

// Gate as an MCP task; taskId encrypts (sessionKey, delivery), stays stateless.

export const GATE_TASK_TTL_MS = 60 * 60 * 1000;
// Verdicts land in minutes; polling faster only costs requests.
export const GATE_TASK_POLL_INTERVAL_MS = 15_000;

const PREFIX = 'gt1.';

// Submit fields the completed result repeats for the outputSchema.
export interface GateTaskDelivery {
  mode: string;
  deliveryId: string;
  delivery: { slug?: string; version?: string } | null;
  gateStarted: boolean;
  deliveriesRemaining: number | null;
}

export interface GateTaskClaims extends GateTaskDelivery {
  sessionKey: string;
  createdAt: number;
  expiresAt: number;
}

function keyFor(secret: string): Buffer {
  return createHash('sha256').update(`mcp-gate-task-v1:${secret}`).digest();
}

export function mintGateTaskId(secret: string, claims: GateTaskClaims): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(claims), 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

// Claims, or null for forged, damaged or expired ids.
export function readGateTaskId(secret: string, taskId: string, nowMs: number): GateTaskClaims | null {
  if (!taskId.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(taskId.slice(PREFIX.length), 'base64url');
    if (raw.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const claims = JSON.parse(text) as GateTaskClaims;
    if (typeof claims.sessionKey !== 'string' || typeof claims.deliveryId !== 'string') return null;
    if (typeof claims.expiresAt !== 'number' || claims.expiresAt <= nowMs) return null;
    return claims;
  } catch {
    return null;
  }
}

// The started gate delivery, or null when nothing is worth awaiting.
export function gateTaskDelivery(result: ToolResult): GateTaskDelivery | null {
  if (result.isError) return null;
  const data = result.structuredContent as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return null;
  if (data.ok !== true || data.gateStarted !== true || typeof data.deliveryId !== 'string') return null;
  if (data.stop === true) return null;
  const delivery =
    data.delivery && typeof data.delivery === 'object' ? (data.delivery as { slug?: string; version?: string }) : null;
  return {
    mode: typeof data.mode === 'string' ? data.mode : 'preview',
    deliveryId: data.deliveryId,
    delivery: delivery ? { slug: delivery.slug, version: delivery.version } : null,
    gateStarted: true,
    deliveriesRemaining: typeof data.deliveriesRemaining === 'number' ? data.deliveriesRemaining : null,
  };
}

export function taskFields(
  taskId: string,
  claims: GateTaskClaims,
  status: 'working' | 'completed',
  statusMessage: string,
  nowMs: number,
) {
  return {
    taskId,
    status,
    statusMessage,
    createdAt: new Date(claims.createdAt).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    ttlMs: Math.max(0, claims.expiresAt - claims.createdAt),
    pollIntervalMs: GATE_TASK_POLL_INTERVAL_MS,
  };
}

export const GATE_TASK_WORKING_MESSAGE =
  'Delivered; the gate is running. The verdict usually lands in 2–5 minutes and completes this task.';

// Submit fields plus the verdict under `gate`, as submit_sources' schema allows.
export function completedGateResult(claims: GateTaskClaims, verdict: ToolResult): ToolResult {
  const gate =
    verdict.structuredContent && typeof verdict.structuredContent === 'object'
      ? (verdict.structuredContent as Record<string, unknown>)
      : {};
  if (verdict.isError) {
    const data = {
      ok: true,
      mode: claims.mode,
      deliveryId: claims.deliveryId,
      delivery: claims.delivery,
      gateStarted: claims.gateStarted,
      deliveriesRemaining: claims.deliveriesRemaining,
      stop: false,
      pendingMessages: [],
      gate: { status: 'unknown', error: gate.error ?? 'gate verdict could not be read' },
    };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  }
  const { stop, reason, warnings, pendingMessages, nextSuggestedTool, ...verdictFields } = gate;
  const data = {
    ok: true,
    mode: claims.mode,
    deliveryId: claims.deliveryId,
    delivery: claims.delivery,
    gateStarted: claims.gateStarted,
    deliveriesRemaining: claims.deliveriesRemaining,
    stop: stop === true,
    ...(typeof reason === 'string' ? { reason } : {}),
    pendingMessages: Array.isArray(pendingMessages) ? pendingMessages : [],
    ...(Array.isArray(warnings) && warnings.length > 0 ? { warnings } : {}),
    ...(typeof nextSuggestedTool === 'string' ? { nextSuggestedTool } : {}),
    gate: verdictFields,
  };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

// True while this delivery's verdict is still building.
export function verdictPending(verdict: ToolResult): boolean {
  if (verdict.isError) return false;
  const data = verdict.structuredContent as { status?: unknown } | undefined;
  return data?.status === 'pending';
}
