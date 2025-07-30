import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { GameWorldState } from '../world-types';
import { indexItems } from './world-index-utils';
import { IndexedWorldState } from './world-index-types';

/**
 * Creates an indexed version of the world state for efficient querying.
 * @param worldState The original game world state.
 * @returns An IndexedWorldState object with searchable entity collections.
 */
export function indexWorldState(worldState: GameWorldState): IndexedWorldState {
  const allEntities = Array.from(worldState.entities.entities.values());

  const humans = allEntities.filter((e) => e.type === 'human') as HumanEntity[];
  const berryBushes = allEntities.filter((e) => e.type === 'berryBush') as BerryBushEntity[];
  const humanCorpses = allEntities.filter((e) => e.type === 'humanCorpse') as HumanCorpseEntity[];
  const prey = allEntities.filter((e) => e.type === 'prey') as PreyEntity[];
  const predators = allEntities.filter((e) => e.type === 'predator') as PredatorEntity[];

  const indexedWorldState: IndexedWorldState = {
    ...worldState,
    search: {
      human: indexItems(humans),
      berryBush: indexItems(berryBushes),
      humanCorpse: indexItems(humanCorpses),
      prey: indexItems(prey),
      predator: indexItems(predators),
    },
  };

  return indexedWorldState;
}
