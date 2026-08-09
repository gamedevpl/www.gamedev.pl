import { type GamesStore } from './games-store.js';

/**
 * Read a delivered version's own-gate verdict off its manifest.
 *
 * Shared between the `/api/agent/build/gate` channel route (agent-channel.ts) and the
 * MCP `start` tool (mcp-server.ts) — both need the same publish/preview distinction, and
 * duplicating it let `start` drift out of sync with what `show_round` / `get_gate_verdict`
 * already report (see the `start` doesn't surface a red gate on reconnect gap, #arena-brawlers).
 */
export interface GateVerdictSummary {
  /** Named so a caller can tell a verdict about *this* delivery from a stale prior one. */
  version: string;
  lane: 'publish' | 'preview';
  green: boolean;
  ranAt: string;
  report?: string;
  previewPassed?: boolean;
  /** `kit_outdated` is a distinct refusal: refresh the kit, do not chase check:game. */
  status?: 'kit_outdated' | 'preview_passed' | 'preview_failed';
}

export interface GateVerdictRecordLike {
  slug?: string | null;
  previewVersion?: string | null;
  deliveredVersion?: string | null;
}

/**
 * Best effort: absent/failed reads as "no verdict yet", same as a genuinely pending gate —
 * callers must not let this take down a hot path like session start or an inbox poll.
 */
export async function readGateVerdict(
  gamesStore: GamesStore | undefined,
  record: GateVerdictRecordLike,
  onError?: (error: unknown) => void,
): Promise<GateVerdictSummary | null> {
  const { slug } = record;
  // Prefer previewVersion: publish writes both pointers to the same id, while a later
  // mode=preview only advances previewVersion. delivered-first would keep reporting the
  // stale publish red after the agent already fixed and re-previewed.
  const version = record.previewVersion ?? record.deliveredVersion;
  if (!gamesStore || !slug || !version) return null;
  try {
    const manifest = await gamesStore.getManifest(slug, version);
    if (manifest?.gate) {
      return {
        version,
        lane: 'publish',
        green: manifest.gate.green,
        ranAt: manifest.gate.ranAt,
        ...(manifest.gate.report ? { report: manifest.gate.report } : {}),
        ...(manifest.gate.status === 'kit_outdated' ? { status: 'kit_outdated' as const } : {}),
      };
    }
    // Preview-lane check: never report as publishable green (that would end the MCP round).
    if (manifest?.previewGate) {
      const kitOutdated = manifest.previewGate.status === 'kit_outdated';
      return {
        version,
        lane: 'preview',
        green: false,
        previewPassed: manifest.previewGate.green,
        ranAt: manifest.previewGate.ranAt,
        ...(manifest.previewGate.report ? { report: manifest.previewGate.report } : {}),
        status: kitOutdated
          ? ('kit_outdated' as const)
          : manifest.previewGate.green
            ? ('preview_passed' as const)
            : ('preview_failed' as const),
      };
    }
    return null;
  } catch (error) {
    onError?.(error);
    return null;
  }
}

/** Same green/kit_outdated/preview_passed/preview_failed/red vocabulary the gate route replies with. */
export function deriveGateStatusString(
  gate: Pick<GateVerdictSummary, 'green' | 'status'>,
): 'green' | 'kit_outdated' | 'preview_passed' | 'preview_failed' | 'red' {
  if (gate.green) return 'green';
  if (gate.status === 'kit_outdated') return 'kit_outdated';
  if (gate.status === 'preview_passed') return 'preview_passed';
  if (gate.status === 'preview_failed') return 'preview_failed';
  return 'red';
}
