import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { GameWorldState } from '../world-types';
import { indexItems } from './world-index-utils';
import { IndexedWorldState } from './world-index-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { Task } from '../ai/task/task-types';

/**
 * Creates an indexed version of the world state for efficient querying.
 * @param worldState The original game world state.
 * @returns An IndexedWorldState object with searchable entity collections.
 */
export function indexWorldState(worldState: GameWorldState): IndexedWorldState {
  const entities = worldState.entities.entities;

  const humans: HumanEntity[] = [];
  const berryBushes: BerryBushEntity[] = [];
  const corpses: CorpseEntity[] = [];
  const prey: PreyEntity[] = [];
  const predators: PredatorEntity[] = [];
  const buildings: BuildingEntity[] = [];
  const trees: TreeEntity[] = [];

  // Use for...in to avoid Object.values() allocation
  for (const id in entities) {
    const entity = entities[id];
    switch (entity.type) {
      case 'human':
        humans.push(entity as HumanEntity);
        break;
      case 'berryBush':
        berryBushes.push(entity as BerryBushEntity);
        break;
      case 'corpse':
        corpses.push(entity as CorpseEntity);
        break;
      case 'prey':
        prey.push(entity as PreyEntity);
        break;
      case 'predator':
        predators.push(entity as PredatorEntity);
        break;
      case 'building':
        buildings.push(entity as BuildingEntity);
        break;
      case 'tree':
        trees.push(entity as TreeEntity);
        break;
    }
  }

  const mapDimensions = worldState.mapDimensions;

  const indexedWorldState: IndexedWorldState = {
    ...worldState,
    search: {
      human: indexItems(humans, mapDimensions),
      berryBush: indexItems(berryBushes, mapDimensions),
      corpse: indexItems(corpses, mapDimensions),
      prey: indexItems(prey, mapDimensions),
      predator: indexItems(predators, mapDimensions),
      building: indexItems(buildings, mapDimensions),
      tree: indexItems(trees, mapDimensions),
      tasks: (worldState as IndexedWorldState).search?.tasks ?? indexItems([], mapDimensions),
    },
    cache: {
      distances: {},
      tribeWoodNeeds: {},
      tribeAvailableWoodOnGround: {},
      tribeCenters: (worldState as IndexedWorldState).cache?.tribeCenters ?? {},
    },
  };

  return indexedWorldState;
}

export function indexTasks(worldState: IndexedWorldState) {
  const tasks: Task[] = [];
  for (const id in worldState.tasks) {
    tasks.push(worldState.tasks[id]);
  }
  worldState.search.tasks = indexItems(tasks, worldState.mapDimensions);
}
