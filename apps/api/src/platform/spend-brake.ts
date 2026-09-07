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

// An unrecognised lane pauses nothing, which is right.

// `reason` says why nothing paused; the log answers instead of asking.
export type BrakeSkipReason = 'no_incident' | 'closed' | 'no_lanes_label' | 'unrecognised_lanes';

export interface BrakeNotification {
  lanes: PauseableLane[];
  incidentId?: string;
  policyName?: string;
  state?: string;
  rawLanes?: string;
  reason?: BrakeSkipReason;
}

export function lanesFromNotification(body: unknown): BrakeNotification {
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

// A Billing budget publishes its state several times a day.
export interface BudgetNotification {
  name: string;
  cost: number;
  budget: number;
  currency?: string;
  thresholdExceeded?: number;
  forecastExceeded?: number;
}

export function budgetFromNotification(body: unknown): BudgetNotification | undefined {
  const b = body as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object') return undefined;
  if (typeof b.costAmount !== 'number' || typeof b.budgetAmount !== 'number') return undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    name: typeof b.budgetDisplayName === 'string' ? b.budgetDisplayName : 'budget',
    cost: b.costAmount,
    budget: b.budgetAmount,
    ...(typeof b.currencyCode === 'string' ? { currency: b.currencyCode } : {}),
    ...(num(b.alertThresholdExceeded) !== undefined ? { thresholdExceeded: num(b.alertThresholdExceeded) } : {}),
    ...(num(b.forecastThresholdExceeded) !== undefined ? { forecastExceeded: num(b.forecastThresholdExceeded) } : {}),
  };
}

// Real spend at or over the budget; a forecast alone never pauses.
export const BUDGET_PAUSE_AT = 1.0;
export const BUDGET_LANES: PauseableLane[] = ['creation', 'editing', 'chat', 'tabComplete', 'search'];

export function lanesFromBudget(budget: BudgetNotification): PauseableLane[] {
  return budget.thresholdExceeded !== undefined && budget.thresholdExceeded >= BUDGET_PAUSE_AT ? BUDGET_LANES : [];
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
      const budget = budgetFromNotification(payload);
      if (budget) {
        const budgetLanes = lanesFromBudget(budget);
        if (budgetLanes.length === 0) {
          request.log.info({ ...budget }, 'budget notification under its ceiling');
          return reply.send({ paused: [], reason: 'budget_under_ceiling' });
        }
        const patch: Partial<CreationLimits> = {};
        for (const lane of budgetLanes) patch[PAUSEABLE[lane]] = true;
        await store.setCreationLimits(patch, `budget:${budget.name}`);
        request.log.error({ ...budget, lanes: budgetLanes }, 'spend brake pulled by a billing budget');
        return reply.send({ paused: budgetLanes });
      }
      const { lanes, incidentId, policyName, state, rawLanes, reason } = lanesFromNotification(payload);
      if (lanes.length === 0) {
        // Acknowledged, not retried: a redelivery pauses nothing either.
        request.log.warn(
          { incidentId, policyName, state, rawLanes, reason, decoded: payload !== undefined },
          'spend brake fired with no recognised lane',
        );
        return reply.send({ paused: [], reason });
      }

      const patch: Partial<CreationLimits> = {};
      for (const lane of lanes) patch[PAUSEABLE[lane]] = true;
      await store.setCreationLimits(patch, `alert:${incidentId ?? 'unknown'}`);
      request.log.error({ incidentId, policyName, lanes }, 'spend brake pulled by a monitoring alert');
      return reply.send({ paused: lanes });
    },
  );
}
