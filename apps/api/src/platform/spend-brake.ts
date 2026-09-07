import type { FastifyInstance } from 'fastify';
import type { CreationLimits, Store } from './store.js';
import type { InternalAuthVerifier } from './internal-auth.js';

// The brake an alert pulls itself. See CC-22 in the plan.

// Pauses lanes only: never raises a cap, never resumes.

// External input picks from this list; `seeding` kills round 0.
const PAUSEABLE = {
  creation: { paused: true },
  editing: { editingPaused: true },
  chat: { chatPaused: true },
  tabComplete: { tabCompletePaused: true },
  search: { searchPaused: true },
  gate: { gatePaused: true },
  seeding: { seedingMode: 'off' },
} as const satisfies Record<string, Partial<CreationLimits>>;

export type PauseableLane = keyof typeof PAUSEABLE;

export function isPauseableLane(value: unknown): value is PauseableLane {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAUSEABLE, value);
}

// GCP labels are lowercase-only, so `tabcomplete` must still name tabComplete.
const LANE_BY_LOWER = new Map(Object.keys(PAUSEABLE).map((lane) => [lane.toLowerCase(), lane as PauseableLane]));

// Both separators: a GCP label cannot hold a comma.
export function parseLanes(raw: unknown): PauseableLane[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<PauseableLane>();
  for (const part of raw.split(/[,_]/)) {
    const lane = LANE_BY_LOWER.get(part.trim().toLowerCase());
    if (lane) seen.add(lane);
  }
  return [...seen];
}

// `reason` says why nothing paused; the log answers instead of asking.
export type BrakeSkipReason =
  'no_incident' | 'closed' | 'no_lanes_label' | 'unrecognised_lanes' | 'budget_under_threshold';

export interface BrakeNotification {
  lanes: PauseableLane[];
  incidentId?: string;
  policyName?: string;
  state?: string;
  rawLanes?: string;
  reason?: BrakeSkipReason;
  // A routine budget tick under every threshold: expected, not worth a warning.
  quiet?: boolean;
}

// Budgets tick every ~20 min; only 100% spent/forecast pulls all lanes.
export function lanesFromBudget(body: unknown): BrakeNotification | undefined {
  const budget = body as Record<string, unknown> | undefined;
  if (!budget || typeof budget !== 'object' || typeof budget.budgetDisplayName !== 'string') return undefined;
  const policyName = budget.budgetDisplayName;
  const ratio = (key: string) => (typeof budget[key] === 'number' ? (budget[key] as number) : 0);
  const spent = ratio('alertThresholdExceeded');
  const forecast = ratio('forecastThresholdExceeded');
  if (spent < 1 && forecast < 1) return { lanes: [], policyName, reason: 'budget_under_threshold', quiet: true };
  const basis = spent >= 1 ? 'spent' : 'forecast';
  return {
    lanes: Object.keys(PAUSEABLE) as PauseableLane[],
    incidentId: `budget:${policyName}:${basis}:${Math.max(spent, forecast)}`,
    policyName,
  };
}

// An unrecognised lane pauses nothing, which is right.
export function lanesFromNotification(body: unknown): BrakeNotification {
  const fromBudget = lanesFromBudget(body);
  if (fromBudget) return fromBudget;
  const incident = (body as { incident?: Record<string, unknown> } | undefined)?.incident;
  if (!incident || typeof incident !== 'object') return { lanes: [], reason: 'no_incident' };
  const state = typeof incident.state === 'string' ? incident.state : undefined;
  const policyName = typeof incident.policy_name === 'string' ? incident.policy_name : undefined;
  const incidentId = typeof incident.incident_id === 'string' ? incident.incident_id : undefined;
  const context = {
    ...(incidentId ? { incidentId } : {}),
    ...(policyName ? { policyName } : {}),
    ...(state ? { state } : {}),
  };
  // A closing notification must never pause anything.
  if (state !== undefined && state !== 'OPEN' && state !== 'open') return { lanes: [], ...context, reason: 'closed' };
  const labels = incident.policy_user_labels ?? incident.policyUserLabels;
  const rawLanes = (labels as Record<string, unknown> | undefined)?.lanes;
  if (typeof rawLanes !== 'string') return { lanes: [], ...context, reason: 'no_lanes_label' };
  const lanes = parseLanes(rawLanes);
  if (lanes.length === 0) return { lanes: [], ...context, rawLanes, reason: 'unrecognised_lanes' };
  return { lanes, ...context, rawLanes };
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
      const { lanes, incidentId, policyName, state, rawLanes, reason, quiet } = lanesFromNotification(payload);
      if (lanes.length === 0) {
        // Acknowledged, not retried: a redelivery pauses nothing either.
        request.log[quiet ? 'info' : 'warn'](
          { incidentId, policyName, state, rawLanes, reason, decoded: payload !== undefined },
          quiet ? 'spend brake heard a budget tick under threshold' : 'spend brake fired with no recognised lane',
        );
        return reply.send({ paused: [], reason });
      }

      const patch: Partial<CreationLimits> = {};
      for (const lane of lanes) Object.assign(patch, PAUSEABLE[lane]);
      await store.setCreationLimits(patch, `alert:${incidentId ?? 'unknown'}`);
      request.log.error({ incidentId, policyName, lanes }, 'spend brake pulled by a monitoring alert');
      return reply.send({ paused: lanes });
    },
  );
}
