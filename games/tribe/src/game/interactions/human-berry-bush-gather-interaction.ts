import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';
import { HUMAN_INTERACTION_RANGE } from '../world-consts';

export const humanBerryBushGatherInteraction: InteractionDefinition<HumanEntity, BerryBushEntity> = {
  id: 'humanBerryBushGather',
  sourceType: 'human',
  targetType: 'berryBush',
  maxDistance: HUMAN_INTERACTION_RANGE,
  checker: (human: HumanEntity, berryBush: BerryBushEntity, context): boolean => {
    return (
      berryBush.currentBerries > 0 &&
      human.stateMachine?.[0] === HUMAN_GATHERING &&
      human.berries < human.maxBerries &&
      (!human.gatheringCooldownTime || human.gatheringCooldownTime < context.gameState.time)
    );
  },
  perform: (human, berryBush, context): void => {
    human.berries += 1;
    berryBush.currentBerries -= 1;
    human.gatheringCooldownTime = context.gameState.time + 1; // 1 second cooldown
  },
};
