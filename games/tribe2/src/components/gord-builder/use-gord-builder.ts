import { useState, useCallback, useMemo, useEffect } from 'react';
import { BuildingType, BUILDING_DEFINITIONS } from '../../game/entities/buildings/building-consts';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { Vector2D } from '../../game/utils/math-types';
import { GameWorldState } from '../../game/world-types';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../../game/entities/tribe/territory-consts';
import { BORDER_EXPANSION_PAINT_RADIUS } from '../../game/entities/buildings/building-consts';
import { NAV_GRID_RESOLUTION } from '../../game/utils/navigation-utils';
import { paintTerrainOwnership } from '../../game/entities/tribe/territory-utils';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../../game/utils/building-placement-utils';
import {
  getAllOwnedGordCells,
  getTribePerimeterEdges,
  calculateProtectionStats,
  assignGates,
  GORD_GRID_RESOLUTION,
  ProtectionStats,
  GORD_WALL_PROXIMITY_THRESHOLD,
} from '../../game/ai/task/tribes/gord-boundary-utils';
import { GORD_MIN_ENCLOSURE_CELLS } from '../../game/ai-consts';
import { PlannedGordEdge, GordPlanStats } from './types';
import { createMockWorldState, createBuildingEntity } from './mock-state-utils';
import { calculateWrappedDistanceSq } from '../../game/utils/math-utils';

/**
 * Calculates statistics and quality metrics for a planned gord.
 */
function calculateGordStats(
  plannedEdges: PlannedGordEdge[],
  totalCells: number,
  protectionStats: ProtectionStats,
): GordPlanStats {
  const gateCount = plannedEdges.filter((e) => e.isGate).length;
  const perimeterLength = plannedEdges.length * GORD_GRID_RESOLUTION;

  // Only count wood for unprotected segments that need building
  const palisadeCount = plannedEdges.reduce((sum, edge) => {
    if (edge.isProtected) return sum;
    return sum + (edge.isGate ? 2 : 5);
  }, 0);

  const enclosedArea = totalCells * GORD_GRID_RESOLUTION * GORD_GRID_RESOLUTION;

  const palisadeWoodCost = BUILDING_DEFINITIONS[BuildingType.Palisade].cost?.wood ?? 1;
  const gateWoodCost = BUILDING_DEFINITIONS[BuildingType.Gate].cost?.wood ?? 3;
  const woodCost = palisadeCount * palisadeWoodCost + gateCount * gateWoodCost;

  let qualityRating: GordPlanStats['qualityRating'] = 'Fair';
  if (totalCells >= GORD_MIN_ENCLOSURE_CELLS * 2) qualityRating = 'Excellent';
  else if (totalCells >= GORD_MIN_ENCLOSURE_CELLS) qualityRating = 'Good';

  return {
    perimeterLength,
    palisadeCount,
    gateCount,
    totalCells,
    enclosedArea,
    woodCost,
    protectedPercentage: protectionStats.protectedPercentage * 100,
    qualityRating,
  };
}

export const useGordBuilder = (canvasWidth: number, canvasHeight: number) => {
  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Bonfire);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(10);
  const [showTerritoryGrid, setShowTerritoryGrid] = useState(true);
  const [showGordGrid, setShowGordGrid] = useState(true);
  const [showPlannedGord, setShowPlannedGord] = useState(true);
  const [plannedGordEdges, setPlannedGordEdges] = useState<PlannedGordEdge[]>([]);
  const [totalGordCells, setTotalGordCells] = useState(0);
  const [protectionStats, setProtectionStats] = useState<ProtectionStats | null>(null);

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(canvasWidth / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(canvasHeight / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedGordEdges.length === 0 || !protectionStats) return null;
    return calculateGordStats(plannedGordEdges, totalGordCells, protectionStats);
  }, [plannedGordEdges, totalGordCells, protectionStats]);

  const snapToGrid = useCallback((x: number, y: number): Vector2D => {
    const gridSize = NAV_GRID_RESOLUTION;
    return { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize };
  }, []);

  const handleCanvasClick = useCallback(
    (x: number, y: number) => {
      const snappedPos = snapToGrid(x, y);
      const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);

      if (!canPlaceBuilding(snappedPos, selectedType, 1, mockState)) return;

      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: canvasWidth, height: canvasHeight },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      const radius =
        selectedType === BuildingType.BorderPost ? BORDER_EXPANSION_PAINT_RADIUS : TERRITORY_BUILDING_RADIUS;

      paintTerrainOwnership(snappedPos, radius, 1, tempState);
      setTerrainOwnership(tempOwnership);

      setPlacedBuildings((prev) => [...prev, newBuilding]);
      setNextBuildingId((prev) => prev + 1);
    },
    [selectedType, nextBuildingId, snapToGrid, placedBuildings, terrainOwnership, canvasWidth, canvasHeight],
  );

  const handleMouseMove = useCallback(
    (x: number, y: number) => {
      setMousePos(snapToGrid(x, y));
    },
    [snapToGrid],
  );

  const clearBuildings = useCallback(() => {
    setPlacedBuildings([]);
    setPlannedGordEdges([]);
    setTotalGordCells(0);
    setProtectionStats(null);
    setNextBuildingId(10);
    setTerrainOwnership(new Array(terrainOwnership.length).fill(null));
  }, [terrainOwnership.length]);

  const planGord = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);
    const ownedCells = getAllOwnedGordCells(1, mockState);

    if (ownedCells.size < GORD_MIN_ENCLOSURE_CELLS) {
      setPlannedGordEdges([]);
      setTotalGordCells(0);
      setProtectionStats(null);
      return;
    }

    const gridWidth = Math.ceil(canvasWidth / GORD_GRID_RESOLUTION);
    const gridHeight = Math.ceil(canvasHeight / GORD_GRID_RESOLUTION);

    const edges = getTribePerimeterEdges(ownedCells, gridWidth, gridHeight);

    const existingWalls = placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
    );

    const stats = calculateProtectionStats(edges, existingWalls, canvasWidth, canvasHeight);
    const edgesWithGates = assignGates(edges);

    setPlannedGordEdges(edgesWithGates);
    setTotalGordCells(ownedCells.size);
    setProtectionStats(stats);
  }, [placedBuildings, terrainOwnership, canvasWidth, canvasHeight]);

  // Automatically plan gord whenever buildings or territory changes
  useEffect(() => {
    planGord();
  }, [planGord]);

  const executeGordPlan = useCallback(() => {
    if (plannedGordEdges.length === 0) return;
    const newBuildings: BuildingEntity[] = [];
    let currentId = nextBuildingId;
    const tempOwnership = [...terrainOwnership];
    const tempState = {
      mapDimensions: { width: canvasWidth, height: canvasHeight },
      terrainOwnership: tempOwnership,
    } as GameWorldState;
    // Gather existing walls for proximity check (including newly placed ones in this batch)
    const allWalls = [
      ...placedBuildings.filter(
        (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
      ),
    ];

    for (const edge of plannedGordEdges) {
      if (edge.isProtected) continue;

      const step = 20;
      const numSteps = GORD_GRID_RESOLUTION / step;
      const dx = edge.to.x > edge.from.x ? step : edge.to.x < edge.from.x ? -step : 0;
      const dy = edge.to.y > edge.from.y ? step : edge.to.y < edge.from.y ? -step : 0;

      let segmentsToSkip = 0;
      for (let i = 0; i < numSteps; i++) {
        if (segmentsToSkip > 0) {
          segmentsToSkip--;
          continue;
        }

        const pos = {
          x: (edge.from.x + dx * i + dx / 2 + canvasWidth) % canvasWidth,
          y: (edge.from.y + dy * i + dy / 2 + canvasHeight) % canvasHeight,
        };
        // Proximity check against existing walls (including those just added in this loop)
        const tooClose = allWalls.some(
          (wall) =>
            calculateWrappedDistanceSq(pos, wall.position, canvasWidth, canvasHeight) <
            GORD_WALL_PROXIMITY_THRESHOLD * GORD_WALL_PROXIMITY_THRESHOLD,
        );

        if (tooClose) continue;

        const buildingType = edge.isGate && i === 2 ? BuildingType.Gate : BuildingType.Palisade;
        const newBuilding = createBuildingEntity(currentId++, buildingType, pos, 1);
        allWalls.push(newBuilding);

        // paintTerrainOwnership(pos, TERRITORY_BUILDING_RADIUS, 1, tempState);
        paintTerrainOwnership(pos, TERRITORY_BUILDING_RADIUS, 1, tempState);

        segmentsToSkip = buildingType === BuildingType.Gate ? 2 : 0;
      }
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
    // Note: We no longer clear plannedGordEdges here.
    // The useEffect will automatically re-plan and update stats after setPlacedBuildings/setTerrainOwnership triggers.
  }, [plannedGordEdges, nextBuildingId, terrainOwnership, canvasWidth, canvasHeight]);

  const autoPlaceSingleBuilding = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);
    const humanPos = { x: canvasWidth / 2, y: canvasHeight / 2 };
    const position = findAdjacentBuildingPlacement(selectedType, 1, mockState, 200, 100, humanPos);

    if (position) {
      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, position, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: canvasWidth, height: canvasHeight },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      paintTerrainOwnership(position, TERRITORY_BUILDING_RADIUS, 1, tempState);
      setTerrainOwnership(tempOwnership);
      setPlacedBuildings((prev) => [...prev, newBuilding]);
      setNextBuildingId((prev) => prev + 1);
    }
  }, [placedBuildings, terrainOwnership, selectedType, nextBuildingId, canvasWidth, canvasHeight]);

  return {
    selectedType,
    setSelectedType,
    placedBuildings,
    mousePos,
    setMousePos,
    nextBuildingId,
    showTerritoryGrid,
    setShowTerritoryGrid,
    showGordGrid,
    setShowGordGrid,
    showPlannedGord,
    setShowPlannedGord,
    plannedGordEdges,
    totalGordCells,
    terrainOwnership,
    gordStats,
    handleCanvasClick,
    handleMouseMove,
    clearBuildings,
    planGord,
    executeGordPlan,
    autoPlaceSingleBuilding,
  };
};
