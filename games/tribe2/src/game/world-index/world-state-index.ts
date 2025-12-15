import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { GameWorldState } from '../world-types';
import { indexItems } from './world-index-utils';
import { IndexedWorldState } from './world-index-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { calculateAllTerritories } from '../utils';
import { vectorSubtract } from '../utils/math-utils';
import { ArrowEntity } from '../entities/arrow/arrow-types';

/**
 * Creates an indexed version of the world state for efficient querying.
 * @param worldState The original game world state.
 * @returns An IndexedWorldState object with searchable entity collections.
 */
export function indexWorldState(worldState: GameWorldState): IndexedWorldState {
  // entities
  const allEntities = Object.values(worldState.entities.entities);

  const humans = allEntities.filter((e) => e.type === 'human') as HumanEntity[];
  const berryBushes = allEntities.filter((e) => e.type === 'berryBush') as BerryBushEntity[];
  const corpses = allEntities.filter((e) => e.type === 'corpse') as CorpseEntity[];
  const prey = allEntities.filter((e) => e.type === 'prey') as PreyEntity[];
  const predators = allEntities.filter((e) => e.type === 'predator') as PredatorEntity[];
  const buildings = allEntities.filter((e) => e.type === 'building') as BuildingEntity[];
  const arrows = allEntities.filter((e) => e.type === 'arrow') as ArrowEntity[];

  const indexedWorldState: IndexedWorldState = {
    ...worldState,
    search: {
      human: indexItems(humans),
      berryBush: indexItems(berryBushes),
      corpse: indexItems(corpses),
      prey: indexItems(prey),
      predator: indexItems(predators),
      building: indexItems(buildings),
      arrow: indexItems(arrows),
      territorySector: indexItems([]), // populated below
    },
    territories: new Map(), // populated below
  };

  // territories
  indexedWorldState.territories = calculateAllTerritories(indexedWorldState);
  indexedWorldState.search.territorySector = indexItems(
    [...indexedWorldState.territories.entries()].flatMap(([leaderId, territory]) =>
      territory.circles.map((circle) => ({
        position: vectorSubtract(circle.center, { x: circle.radius, y: circle.radius }),
        width: circle.radius * 2,
        height: circle.radius * 2,
        circle,
        leaderId,
      })),
    ),
  );

  return indexedWorldState;
}
