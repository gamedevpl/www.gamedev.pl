import { Vector2D } from '../game/types/math-types';
import { Vector3D } from '../game/types/rendering-types';
import { HEIGHT_MAP_RESOLUTION } from '../game/constants/world-constants';
import { clamp, lerp, easeInOutCubic } from '../game/utils/animation-utils';

// Animation phase durations in seconds
const ZOOM_OUT_DURATION = 2;
const PAN_DURATION = 4;
const ZOOM_IN_DURATION = 2;
const HOLD_DURATION = 2;

// Light animation period (full rotation in seconds)
const LIGHT_ROTATION_PERIOD = 20;

export type IntroAnimState = {
  phase: 'zoomOut' | 'pan' | 'zoomIn' | 'hold';
  t: number;
  duration: number;
  poiIndex: number;
  pois: Vector2D[];
  startCenter: Vector2D;
  targetCenter: Vector2D;
  startZoom: number;
  targetZoom: number;
  baseZoom: number;
  focusZoom: number;
  mapDimensions: { width: number; height: number };
  lightTime: number; // Accumulated time for light rotation
};

/**
 * Computes points of interest from the height map.
 * Selects high-elevation points that are well-spaced across the map.
 */
function computePOIs(
  heightMap: number[][],
  count: number,
  mapDimensions: { width: number; height: number },
): Vector2D[] {
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0].length;

  // Flatten grid cells with their coordinates and values
  const cells: { x: number; y: number; value: number }[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      cells.push({ x, y, value: heightMap[y][x] });
    }
  }

  // Sort by height value descending
  cells.sort((a, b) => b.value - a.value);

  // Greedily select POIs with minimum spacing
  const minDist = Math.min(mapDimensions.width, mapDimensions.height) / 6;
  const selectedPOIs: Vector2D[] = [];

  for (const cell of cells) {
    if (selectedPOIs.length >= count) break;

    // Convert grid coordinates to world coordinates
    const worldX = cell.x * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2;
    const worldY = cell.y * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2;
    const candidate = { x: worldX, y: worldY };

    // Check if this candidate is far enough from already selected POIs
    const isFarEnough = selectedPOIs.every((poi) => {
      const dx = candidate.x - poi.x;
      const dy = candidate.y - poi.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist >= minDist;
    });

    if (isFarEnough) {
      selectedPOIs.push(candidate);
    }
  }

  // Fallback: if we couldn't find enough POIs, add some random ones
  while (selectedPOIs.length < count) {
    selectedPOIs.push({
      x: Math.random() * mapDimensions.width,
      y: Math.random() * mapDimensions.height,
    });
  }

  return selectedPOIs;
}

/**
 * Computes the light direction based on elapsed time.
 * The light rotates in a circular pattern around the scene.
 */
function computeLightDirection(time: number): Vector3D {
  const angle = (time / LIGHT_ROTATION_PERIOD) * Math.PI * 2;
  const elevation = 0.6; // Keep light at a consistent elevation angle

  return {
    x: Math.cos(angle) * Math.cos(elevation),
    y: Math.sin(angle) * Math.cos(elevation),
    z: Math.sin(elevation),
  };
}

/**
 * Initializes the intro animation state.
 */
export function initIntroAnimation(
  heightMap: number[][],
  mapDimensions: { width: number; height: number },
  options?: { baseZoom?: number; focusZoom?: number; poiCount?: number },
): IntroAnimState {
  const baseZoom = options?.baseZoom ?? 0.8;
  const focusZoom = options?.focusZoom ?? 2.0;
  const poiCount = options?.poiCount ?? 8;

  const pois = computePOIs(heightMap, poiCount, mapDimensions);
  const initialCenter = { x: mapDimensions.width / 2, y: mapDimensions.height / 2 };

  return {
    phase: 'zoomOut',
    t: 0,
    duration: ZOOM_OUT_DURATION,
    poiIndex: 0,
    pois,
    startCenter: initialCenter,
    targetCenter: initialCenter,
    startZoom: 1.0,
    targetZoom: baseZoom,
    baseZoom,
    focusZoom,
    mapDimensions,
    lightTime: 0,
  };
}

/**
 * Updates the intro animation state and returns the current camera position, zoom, and light direction.
 */
export function updateIntroAnimation(
  state: IntroAnimState,
  dtSeconds: number,
): { center: Vector2D; zoom: number; lightDir: Vector3D } {
  // Advance time
  state.t += dtSeconds;
  state.lightTime += dtSeconds;

  // Check if we need to transition to the next phase
  while (state.t >= state.duration) {
    state.t -= state.duration;

    switch (state.phase) {
      case 'zoomOut':
        // Transition to pan phase
        state.phase = 'pan';
        state.duration = PAN_DURATION;
        state.startCenter = state.targetCenter;
        state.targetCenter = state.pois[state.poiIndex];
        state.startZoom = state.baseZoom;
        state.targetZoom = state.baseZoom;
        break;

      case 'pan':
        // Transition to zoom in phase
        state.phase = 'zoomIn';
        state.duration = ZOOM_IN_DURATION;
        state.startCenter = state.targetCenter;
        state.startZoom = state.baseZoom;
        state.targetZoom = state.focusZoom;
        break;

      case 'zoomIn':
        // Transition to hold phase
        state.phase = 'hold';
        state.duration = HOLD_DURATION;
        state.startZoom = state.focusZoom;
        state.targetZoom = state.focusZoom;
        break;

      case 'hold':
        // Transition to zoom out phase and advance to next POI
        state.poiIndex = (state.poiIndex + 1) % state.pois.length;
        state.phase = 'zoomOut';
        state.duration = ZOOM_OUT_DURATION;
        state.startCenter = state.targetCenter;
        state.startZoom = state.focusZoom;
        state.targetZoom = state.baseZoom;
        break;
    }
  }

  // Calculate interpolation factor with easing
  const progress = clamp(state.t / state.duration, 0, 1);
  const easedProgress = easeInOutCubic(progress);

  // Interpolate center position
  const center: Vector2D = {
    x: lerp(state.startCenter.x, state.targetCenter.x, easedProgress),
    y: lerp(state.startCenter.y, state.targetCenter.y, easedProgress),
  };

  // Interpolate zoom level
  const zoom = lerp(state.startZoom, state.targetZoom, easedProgress);

  // Compute animated light direction
  const lightDir = computeLightDirection(state.lightTime);

  return { center, zoom, lightDir };
}
