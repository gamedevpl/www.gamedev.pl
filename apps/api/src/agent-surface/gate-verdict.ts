import type { GamesStore } from '../delivery/games-store.js';
import { derivePreviewGateStatus } from '@gamedevpl/contract';

// Shared by the channel's gate route and MCP `start`.
export interface GateVerdictSummary {
  version: string;
  lane: 'publish' | 'preview';
  green: boolean;
  ranAt: string;
  report?: string;
  previewPassed?: boolean;
  status?: 'kit_outdated' | 'preview_passed' | 'preview_failed';
}

export interface GateVerdictRecordLike {
  slug?: string | null;
  previewVersion?: string | null;
  deliveredVersion?: string | null;
}

// Best effort: a read failure reads as "no verdict yet".
export async function readGateVerdict(
  gamesStore: GamesStore | undefined,
  record: GateVerdictRecordLike,
  onError?: (error: unknown) => void,
): Promise<GateVerdictSummary | null> {
  const { slug } = record;
  // previewVersion first: a later mode=preview only advances that pointer.
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
    // Preview lane: never green — that would end the MCP round.
    if (manifest?.previewGate) {
      return {
        version,
        lane: 'preview',
        green: false,
        previewPassed: manifest.previewGate.green,
        ranAt: manifest.previewGate.ranAt,
        ...(manifest.previewGate.report ? { report: manifest.previewGate.report } : {}),
        status: derivePreviewGateStatus(manifest.previewGate),
      };
    }
    return null;
  } catch (error) {
    onError?.(error);
    return null;
  }
}
