import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { GameWorldState } from '../world-types';
import { indexItems } from './world-index-utils';
import { IndexedWorldState } from './world-index-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../entities/tribe/territory-consts';
import { convertTerritoryIndexToPosition } from '../utils';
import { TreeEntity } from '../entities/plants/tree/tree-types';

/**
 * Creates an indexed version of the world state for efficient querying.
 * @param worldState The original game world state.
 * @returns An IndexedWorldState object with searchable entity collections.
 */
export function indexWorldState(worldState: GameWorldState): IndexedWorldState {
  // entities
  const allEntities = Object.values(worldState.entities.entities);

  const humans: HumanEntity[] = [];
  const berryBushes: BerryBushEntity[] = [];
  const corpses: CorpseEntity[] = [];
  const prey: PreyEntity[] = [];
  const predators: PredatorEntity[] = [];
  const buildings: BuildingEntity[] = [];
  const trees: TreeEntity[] = [];

  for (const entity of allEntities) {
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

  const indexedWorldState: IndexedWorldState = {
    ...worldState,
    search: {
      human: indexItems(humans),
      berryBush: indexItems(berryBushes),
      corpse: indexItems(corpses),
      prey: indexItems(prey),
      predator: indexItems(predators),
      building: indexItems(buildings),
      tree: indexItems(trees),
      terrainOwnership: indexItems(
        worldState.terrainOwnership
          .map((ownerId, index) => {
            if (ownerId === null) {
              return null;
            }
            return {
              position: convertTerritoryIndexToPosition(index, worldState.mapDimensions.width),
              width: TERRITORY_OWNERSHIP_RESOLUTION,
              height: TERRITORY_OWNERSHIP_RESOLUTION,
              ownerId,
            };
          })
          .filter((item) => item != null),
      ),
    },
  };

  return indexedWorldState;
}
