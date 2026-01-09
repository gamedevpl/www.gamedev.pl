import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../../game/entities/buildings/building-consts';
import { GameWorldState } from '../../game/world-types';
import { Vector2D } from '../../game/utils/math-types';
import { Blackboard } from '../../game/ai/behavior-tree/behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../game/utils/math-utils';
import { IndexedWorldState, IndexType } from '../../game/world-index/world-index-types';
import { HumanEntity } from '../../game/entities/characters/human/human-types';
import { AIType } from '../../game/ai/ai-types';
import { BerryBushEntity } from '../../game/entities/plants/berry-bush/berry-bush-types';
import { TreeEntity } from '../../game/entities/plants/tree/tree-types';
import { CorpseEntity } from '../../game/entities/characters/corpse-types';
import { PreyEntity } from '../../game/entities/characters/prey/prey-types';
import { PredatorEntity } from '../../game/entities/characters/predator/predator-types';
import { Task } from '../../game/ai/task/task-types';

/**
 * Creates a mock GameWorldState for the Gord Builder test environment.
 * Provides a simplified version of the game engine's state and search functionality.
 */
export const createMockWorldState = (
  buildings: BuildingEntity[],
  terrainOwnership: (number | null)[],
  canvasWidth: number,
  canvasHeight: number,
): GameWorldState => {
  const entitiesMap: Record<number, BuildingEntity | HumanEntity> = buildings.reduce((acc, b) => {
    acc[b.id] = b;
    return acc;
  }, {} as Record<number, BuildingEntity | HumanEntity>);

  // Mock player leader
  const playerLeader: HumanEntity = {
    id: 1,
    type: 'human',
    leaderId: 1,
    isPlayer: true,
    tribeInfo: { tribeBadge: '👑', tribeColor: '#4CAF50' },
    position: { x: canvasWidth / 2, y: canvasHeight / 2 },
    radius: 10,
    isAdult: true,
    gender: 'male',
    age: 25,
    stateMachine: ['', { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
    debuffs: [],
    forces: [],
    velocity: { x: 0, y: 0 },
    acceleration: 0,
    direction: { x: 0, y: 0 },
    food: [],
    maxFood: 10,
    ancestorIds: [],
    hitpoints: 100,
    maxHitpoints: 100,
    maxAge: 100,
    hunger: 0,
    aiType: AIType.TaskBased,
  };

  entitiesMap[1] = playerLeader;

  const state = {
    time: 0,
    mapDimensions: { width: canvasWidth, height: canvasHeight },
    entities: { entities: entitiesMap },
    terrainOwnership,
    notifications: [],
    visualEffects: [],
    tutorialState: { isActive: false, highlightedEntityIds: [], activeUIHighlights: [] },
    plantingZoneConnections: {},
    navigationGrid: {
      obstacleCount: new Uint16Array(0),
      paddingCount: new Uint16Array(0),
      gateRefCount: {},
      gatePaddingRefCount: {},
    },
    tasks: {},
    soilDepletion: {},
  } as unknown as GameWorldState;

  const indexedState = state as unknown as IndexedWorldState;

  // Add search functionality (simulating IndexedWorldState)
  indexedState.search = {
    building: {
      all: () => buildings,
      byRadius: (pos: Vector2D, radius: number) =>
        buildings.filter((b) => calculateWrappedDistance(pos, b.position, canvasWidth, canvasHeight) <= radius),
      byRect: () => buildings,
      byProperty: (prop: keyof BuildingEntity, value: unknown) => buildings.filter((b) => b[prop] === value),
      at: (pos: Vector2D, radius: number) =>
        buildings.find((b) => calculateWrappedDistance(pos, b.position, canvasWidth, canvasHeight) <= radius),
    } as unknown as IndexType<BuildingEntity>,
    human: {
      all: () => [playerLeader],
      byProperty: () => [],
      byRadius: () => [],
      byRect: () => [playerLeader],
    } as unknown as IndexType<HumanEntity>,
    berryBush: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexType<BerryBushEntity>,
    tree: { byRect: () => [], all: () => [], byRadius: () => [] } as unknown as IndexType<TreeEntity>,
    corpse: { byRect: () => [], all: () => [] } as unknown as IndexType<CorpseEntity>,
    prey: { byRect: () => [], all: () => [] } as unknown as IndexType<PreyEntity>,
    predator: { byRect: () => [], all: () => [] } as unknown as IndexType<PredatorEntity>,
    tasks: { byRect: () => [], all: () => [] } as unknown as IndexType<Task>,
  };

  indexedState.cache = {
    distances: {},
    tribeWoodNeeds: {},
    tribeAvailableWoodOnGround: {},
    tribeCenters: {},
  };

  return state;
};

/**
 * Creates a mock BuildingEntity for placement in the test environment.
 */
export const createBuildingEntity = (
  id: number,
  buildingType: BuildingType,
  position: Vector2D,
  ownerId: number,
): BuildingEntity => {
  const definition = BUILDING_DEFINITIONS[buildingType];
  return {
    id,
    type: 'building',
    buildingType,
    position,
    ownerId,
    constructionProgress: 1,
    destructionProgress: 0,
    isConstructed: true,
    isBeingDestroyed: false,
    width: definition.dimensions.width,
    height: definition.dimensions.height,
    storedItems: [],
    storageCapacity: 10,
    radius: Math.max(definition.dimensions.width, definition.dimensions.height) / 2,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    stateMachine: ['', { enteredAt: 0 }],
    aiBlackboard: Blackboard.create(),
  } as BuildingEntity;
};
