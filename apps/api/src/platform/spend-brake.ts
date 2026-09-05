import type { FastifyInstance } from 'fastify';
import type { CreationLimits, Store } from './store.js';
import type { InternalAuthVerifier } from './internal-auth.js';

// The brake an alert pulls itself. See CC-22 in the plan.

// Pauses lanes only: never raises a cap, never resumes.

// External input selects from this list, never names a field.
const PAUSEABLE = {
  creation: 'paused',
  editing: 'editingPaused',
  chat: 'chatPaused',
  tabComplete: 'tabCompletePaused',
  search: 'searchPaused',
  gate: 'gatePaused',
} as const satisfies Record<string, keyof CreationLimits>;

export type PauseableLane = keyof typeof PAUSEABLE;

export function isPauseableLane(value: unknown): value is PauseableLane {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAUSEABLE, value);
}

// Both separators: a GCP label cannot hold a comma.
export function parseLanes(raw: unknown): PauseableLane[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<PauseableLane>();
  for (const part of raw.split(/[,_]/)) {
    const lane = part.trim();
    if (isPauseableLane(lane)) seen.add(lane);
  }
  return [...seen];
}

// An unrecognised lane pauses nothing, which is right.
export function lanesFromNotification(body: unknown): { lanes: PauseableLane[]; incidentId?: string } {
  const incident = (body as { incident?: Record<string, unknown> } | undefined)?.incident;
  if (!incident || typeof incident !== 'object') return { lanes: [] };
  const state = incident.state;
  // A closing notification must never pause anything.
  if (state !== undefined && state !== 'OPEN' && state !== 'open') return { lanes: [] };
  const labels = incident.policy_user_labels ?? incident.policyUserLabels;
  const lanes = parseLanes((labels as Record<string, unknown> | undefined)?.lanes);
  const incidentId = typeof incident.incident_id === 'string' ? incident.incident_id : undefined;
  return { lanes, ...(incidentId ? { incidentId } : {}) };
}

// Pub/Sub push wraps the payload as base64.
export function decodePushEnvelope(body: unknown): unknown {
  const data = (body as { message?: { data?: unknown } } | undefined)?.message?.data;
  if (typeof data !== 'string') return body;
  try {
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

export interface SpendBrakeRoutesOptions {
  store?: Store;
  internalAuthVerifier: InternalAuthVerifier;
}

export async function registerSpendBrakeRoutes(app: FastifyInstance, options: SpendBrakeRoutesOptions): Promise<void> {
  app.post(
    '/api/internal/spend-brake',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await options.internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }
      const { store } = options;
      if (!store) return reply.status(503).send({ error: 'the spend brake is not configured' });

      const payload = decodePushEnvelope(request.body);
      const { lanes, incidentId } = lanesFromNotification(payload);
      if (lanes.length === 0) {
        // Acknowledged, not retried: a redelivery pauses nothing either.
        request.log.warn({ incidentId }, 'spend brake fired with no recognised lane');
        return reply.send({ paused: [] });
      }

      const patch: Partial<CreationLimits> = {};
      for (const lane of lanes) patch[PAUSEABLE[lane]] = true;
      await store.setCreationLimits(patch, `alert:${incidentId ?? 'unknown'}`);
      request.log.error({ incidentId, lanes }, 'spend brake pulled by a monitoring alert');
      return reply.send({ paused: lanes });
    },
  );
}
