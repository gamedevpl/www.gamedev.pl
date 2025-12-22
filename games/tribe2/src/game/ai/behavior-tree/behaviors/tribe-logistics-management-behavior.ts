import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { getTribeBonfires } from '../../../entities/tribe/tribe-food-utils';
import { registerDemand } from '../../supply-chain/tribe-logistics-utils';
import {
  BONFIRE_MAX_FUEL,
  BONFIRE_REFUEL_THRESHOLD_RATIO,
  BONFIRE_LOGISTICS_CHECK_INTERVAL_HOURS,
} from '../../../temperature/temperature-consts';
import { ActionNode, CachingNode } from '../nodes';

/**
 * Behavior for tribe leaders to monitor bonfire fuel levels and register logistics demands.
 * This behavior ensures that bonfires are regularly refueled by tribe members with the Mover role.
 */
export function createTribeLogisticsManagementBehavior(depth: number): BehaviorNode<HumanEntity> {
  const action = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      // 1. Check if the entity is a tribe leader
      if (!human.leaderId || human.id !== human.leaderId) {
        return [NodeStatus.FAILURE, 'Not a tribe leader'];
      }

      // 2. Iterate through all tribe bonfires
      const bonfires = getTribeBonfires(human.id, context.gameState);
      let demandsRegistered = 0;

      for (const bonfire of bonfires) {
        // 3. For each bonfire, if it's constructed and its fuel level is below threshold
        if (bonfire.isConstructed && bonfire.fuelLevel !== undefined) {
          const maxFuel = bonfire.maxFuelLevel ?? BONFIRE_MAX_FUEL;
          if (bonfire.fuelLevel < maxFuel * BONFIRE_REFUEL_THRESHOLD_RATIO) {
            // Register a demand for wood for this specific bonfire
            registerDemand(blackboard, bonfire.id, 'wood', context.gameState.time);
            demandsRegistered++;
          }
        }
      }

      // 4. Return SUCCESS with debug info about how many demands were registered
      return [
        NodeStatus.SUCCESS,
        `Tribe logistics: ${demandsRegistered} wood demands registered for bonfires`,
      ];
    },
    'Manage Tribe Logistics',
    depth + 1,
  );

  // Wrap in CachingNode to avoid running every tick, using the interval defined in constants
  return new CachingNode(
    action,
    BONFIRE_LOGISTICS_CHECK_INTERVAL_HOURS,
    'Cached Tribe Logistics',
    depth,
  );
}
