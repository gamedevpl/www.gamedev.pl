/**
 * Lazy MediaPipe Hand Landmarker loader for the sensing Phase 1 shell spike.
 *
 * The package is loaded only inside `loadHandLandmarker()` so the always-mounted
 * sensing bridge does not pull MediaPipe into the startup graph. The `.task` model
 * still loads from Google storage during the spike. Production must vendor wasm +
 * model under our origin before store submission (ops camera-verbs-plan §4.3 / §5).
 *
 * Failures are soft: the game keeps keyboard/pointer; hand simply stays unavailable.
 */

import type { Landmark } from './handVerbs.js';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export type HandLandmarkerHandle = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => { landmarks: Array<Array<{ x: number; y: number; z?: number }>> };
  close: () => void;
};

let loadPromise: Promise<HandLandmarkerHandle | null> | null = null;

async function createLandmarker(): Promise<HandLandmarkerHandle | null> {
  try {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    try {
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
    } catch {
      // CPU fallback — some iOS WebViews reject the GPU delegate.
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    }
  } catch {
    return null;
  }
}

/** Shared loader — one model instance per page is enough for the theater. */
export function loadHandLandmarker(): Promise<HandLandmarkerHandle | null> {
  if (!loadPromise) loadPromise = createLandmarker();
  return loadPromise;
}

/** Test seam: reset the memoized loader. */
export function resetHandLandmarkerLoader(): void {
  loadPromise = null;
}

export function landmarksFromVideo(
  landmarker: HandLandmarkerHandle,
  video: HTMLVideoElement,
  timestampMs: number,
): Landmark[] | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  try {
    const result = landmarker.detectForVideo(video, timestampMs);
    const hand = result.landmarks?.[0];
    if (!hand || hand.length < 9) return null;
    return hand.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  } catch {
    return null;
  }
}

/** Closed-beta spike: `?handSpike=1` on the theater URL forces the hand pipeline. */
export function handSpikeEnabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('handSpike') === '1';
  } catch {
    return false;
  }
}
