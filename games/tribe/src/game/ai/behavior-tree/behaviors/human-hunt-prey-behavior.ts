import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, CachingNode, ConditionNode, Sequence, TimeoutNode } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { getTribeCenter, findClosestEntity, findEntitiesOfTypeInRadius } from '../../../utils';
import {
  AI_HUNTING_FOOD_SEARCH_RADIUS,
  AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER,
  BT_ACTION_TIMEOUT_HOURS,
  BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
} from '../../../world-consts';

const HUNT_TARGET_KEY = 'huntTarget';

/**
 * Creates a behavior tree branch for humans hunting prey
 */
export function createHumanHuntPreyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const huntSequence = new Sequence(
    [
      // 2. Find a suitable prey to hunt (cached to avoid frequent searching)
      new CachingNode(
        new ConditionNode(
          (human: HumanEntity, context: UpdateContext, blackboard) => {
            if (!human.isAdult) {
              return [false, 'Not an adult'];
            }

            if (!human.leaderId) {
              return [false, 'Not in a tribe'];
            }

            const tribeCenter = getTribeCenter(human.leaderId, context.gameState);

            // Check for easier food sources first
            const nearbyBushes =
              findEntitiesOfTypeInRadius(
                tribeCenter,
                context.gameState,
                'berryBush',
                AI_HUNTING_FOOD_SEARCH_RADIUS,
              )?.map((bush) => bush.id) || [];

            const nearbyPrey = findClosestEntity<PreyEntity>(
              tribeCenter,
              context.gameState,
              'prey',
              AI_HUNTING_FOOD_SEARCH_RADIUS,
              (prey) => typeof prey.target === 'number' && nearbyBushes.includes(prey.target),
            );

            if (nearbyPrey) {
              blackboard.set(HUNT_TARGET_KEY, nearbyPrey.id);
              return true;
            }

            return false;
          },
          'Find Prey Target',
          depth + 2,
        ),
        BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
        'Cache Find Prey',
        depth + 1,
      ),

      // 3. Action: Hunt the prey (with a timeout to prevent getting stuck)
      new TimeoutNode<HumanEntity>(
        new ActionNode(
          (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
            if (!human.leaderId) {
              return NodeStatus.FAILURE;
            }

            const targetId = blackboard.get<number>(HUNT_TARGET_KEY);
            if (!targetId) {
              return NodeStatus.FAILURE;
            }
            const target = context.gameState.entities.entities.get(targetId) as PreyEntity | undefined;
            if (!target || target.hitpoints <= 0) {
              blackboard.delete(HUNT_TARGET_KEY);
              human.activeAction = 'idle';
              human.attackTargetId = undefined;
              return NodeStatus.SUCCESS; // Target is dead or gone
            }

            const { gameState } = context;
            const tribeCenter = getTribeCenter(human.leaderId, gameState);
            const distanceFromCenter = calculateWrappedDistance(
              human.position,
              tribeCenter,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            );

            // Fail if chasing too far from home
            if (distanceFromCenter > AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER) {
              blackboard.delete(HUNT_TARGET_KEY);
              human.activeAction = 'idle';
              human.attackTargetId = undefined;
              return NodeStatus.FAILURE;
            }

            // Set hunting state
            human.activeAction = 'attacking';
            human.attackTargetId = target.id;

            // The actual hunting/attacking is handled by the interaction system
            return NodeStatus.RUNNING;
          },
          'Hunt Prey Action',
          depth + 2,
        ),
        BT_ACTION_TIMEOUT_HOURS, // Use a generous timeout
        'Hunt Prey Timeout',
        depth + 1,
      ),
    ],
    'Human Hunt Prey Sequence',
    depth,
  );

  return huntSequence;
}
