import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  BuildingType,
  BUILDING_DEFINITIONS,
  getBuildingTerritoryRadius,
} from '../../game/entities/buildings/building-consts';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { Vector2D } from '../../game/utils/math-types';
import { GameWorldState } from '../../game/world-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../game/entities/tribe/territory-consts';
import { NAV_GRID_RESOLUTION } from '../../game/utils/navigation-utils';
import { paintTerrainOwnership, convertTerritoryIndexToPosition } from '../../game/entities/tribe/territory-utils';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../../game/utils/building-placement-utils';
import {
  getInteriorEdgeIndices,
  traceEdgeChains,
  planGordPlacement,
  calculateGordCoverage,
  GordPlacement,
} from '../../game/ai/task/tribes/gord-boundary-utils';
import { GORD_MIN_ENCLOSURE_CELLS, GORD_WALL_PROXIMITY_THRESHOLD } from '../../game/ai-consts';
import { PlannedGordEdge, GordPlanStats } from './types';
import { createMockWorldState, createBuildingEntity } from './mock-state-utils';
import { calculateWrappedDistanceSq } from '../../game/utils/math-utils';

/**
 * Calculates statistics and quality metrics for a planned gord.
 */
function calculateGordStats(placements: GordPlacement[], totalCells: number, coverage: number): GordPlanStats {
  const gateCount = placements.filter((p) => p.type === BuildingType.Gate).length;
  const palisadeCount = placements.filter((p) => p.type === BuildingType.Palisade).length;
  const perimeterLength = placements.length * TERRITORY_OWNERSHIP_RESOLUTION;

  const enclosedArea = totalCells * TERRITORY_OWNERSHIP_RESOLUTION * TERRITORY_OWNERSHIP_RESOLUTION;

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
    protectedPercentage: coverage * 100,
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
  const [plannedPlacements, setPlannedPlacements] = useState<GordPlacement[]>([]);
  const [totalGordCells, setTotalGordCells] = useState(0);
  const [coverage, setCoverage] = useState<number>(0);

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(canvasWidth / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(canvasHeight / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedPlacements.length === 0) return null;
    return calculateGordStats(plannedPlacements, totalGordCells, coverage);
  }, [plannedPlacements, totalGordCells, coverage]);

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
      const radius = getBuildingTerritoryRadius(selectedType);

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
    setPlannedPlacements([]);
    setTotalGordCells(0);
    setCoverage(0);
    setNextBuildingId(10);
    setTerrainOwnership(new Array(terrainOwnership.length).fill(null));
  }, [terrainOwnership.length]);

  const planGord = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);
    const ownedCells = getInteriorEdgeIndices(1, mockState);

    if (ownedCells.size < GORD_MIN_ENCLOSURE_CELLS) {
      setPlannedGordEdges([]);
      setPlannedPlacements([]);
      setTotalGordCells(0);
      setCoverage(0);
      return;
    }

    const gridWidth = Math.ceil(canvasWidth / TERRITORY_OWNERSHIP_RESOLUTION);
    const gridHeight = Math.ceil(canvasHeight / TERRITORY_OWNERSHIP_RESOLUTION);

    // 1. Generate placements (what the AI actually does)
    const placements = planGordPlacement(1, mockState);
    setPlannedPlacements(placements);

    // 2. Generate visualization edges from chains
    const chains = traceEdgeChains(ownedCells, gridWidth, gridHeight);
    const edges: PlannedGordEdge[] = [];

    for (const chain of chains) {
      for (let i = 0; i < chain.length - 1; i++) {
        const fromIdx = chain[i];
        const toIdx = chain[i + 1];
        const fromPos = convertTerritoryIndexToPosition(fromIdx, canvasWidth);
        const toPos = convertTerritoryIndexToPosition(toIdx, canvasWidth);

        // Check if this segment corresponds to a gate placement
        // We approximate by checking if the 'from' position is near a planned gate
        const isGate = placements.some(
          (p) =>
            p.type === BuildingType.Gate &&
            calculateWrappedDistanceSq(p.position, fromPos, canvasWidth, canvasHeight) <
              TERRITORY_OWNERSHIP_RESOLUTION * TERRITORY_OWNERSHIP_RESOLUTION,
        );

        edges.push({
          from: fromPos,
          to: toPos,
          isGate,
          isProtected: false, // Simplified for visualization
        });
      }
    }
    setPlannedGordEdges(edges);

    // 3. Calculate coverage
    const existingWalls = placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
    );
    const currentCoverage = calculateGordCoverage(1, mockState, existingWalls);
    setCoverage(currentCoverage);
    setTotalGordCells(ownedCells.size);
  }, [placedBuildings, terrainOwnership, canvasWidth, canvasHeight]);

  // Automatically plan gord whenever buildings or territory changes
  useEffect(() => {
    planGord();
  }, [planGord]);

  const executeGordPlan = useCallback(() => {
    if (plannedPlacements.length === 0) return;
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

    for (const placement of plannedPlacements) {
      const pos = placement.position;

      // Proximity check against existing walls
      const tooClose = allWalls.some(
        (wall) =>
          calculateWrappedDistanceSq(pos, wall.position, canvasWidth, canvasHeight) <
          GORD_WALL_PROXIMITY_THRESHOLD * GORD_WALL_PROXIMITY_THRESHOLD,
      );

      if (tooClose) continue;

      const newBuilding = createBuildingEntity(currentId++, placement.type, pos, 1);
      newBuildings.push(newBuilding);
      allWalls.push(newBuilding);

      paintTerrainOwnership(pos, getBuildingTerritoryRadius(placement.type), 1, tempState);
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
  }, [plannedPlacements, nextBuildingId, terrainOwnership, canvasWidth, canvasHeight, placedBuildings]);

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
      paintTerrainOwnership(position, getBuildingTerritoryRadius(selectedType), 1, tempState);
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
