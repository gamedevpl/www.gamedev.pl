import {
  LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
  PLAYER_CALL_TO_ATTACK_RADIUS,
  AI_FLEE_DISTANCE,
  LEADER_COMBAT_STRENGTH_ADVANTAGE_THRESHOLD,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findNearbyEnemiesOfTribe, calculateTribeStrength, findTribeMembers } from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, Selector, CooldownNode } from '../nodes';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';
import {
  getAveragePosition,
  getDirectionVectorOnTorus,
  vectorAdd,
  vectorNormalize,
  vectorScale,
} from '../../../utils/math-utils';

const ENEMIES_NEARBY_KEY = 'enemiesNearby';

/**
 * Creates a behavior that allows a tribe leader to make a strategic decision:
 * either issue a "call to attack" if the tribe is strong enough, or retreat if not.
 * The entire decision-making process is placed on a cooldown to prevent it from running too frequently.
 */
export function createLeaderCombatStrategyBehavior(depth: number): BehaviorNode {
  // Basic conditions to check before any combat decision is made.
  const isLeader = new ConditionNode((human) => human.id === human.leaderId, 'Is Leader?', depth + 1);
  const isNotAlreadyCalling = new ConditionNode(
    (human) => !human.isCallingToAttack,
    'Is Not Already Calling?',
    depth + 1,
  );

  // Action to find enemies and store them in the blackboard. This is a prerequisite for the decision.
  const findEnemies = new ActionNode(
    (human, context, blackboard) => {
      const enemies = findNearbyEnemiesOfTribe(
        human.position,
        human.id,
        context.gameState as IndexedWorldState,
        PLAYER_CALL_TO_ATTACK_RADIUS,
      );
      if (enemies.length > 0) {
        blackboard.set(ENEMIES_NEARBY_KEY, enemies);
        return NodeStatus.SUCCESS;
      }
      return NodeStatus.FAILURE;
    },
    'Find Nearby Enemies',
    depth + 1,
  );

  // The core decision logic: a Selector that chooses between attacking and retreating.
  const attackOrRetreat = new Selector(
    [
      // Branch 1: Attack, if strong enough.
      new Sequence(
        [
          new ConditionNode(
            (human, context, blackboard) => {
              const enemies = blackboard.get<HumanEntity[]>(ENEMIES_NEARBY_KEY);
              if (!enemies || enemies.length === 0) {
                return false;
              }

              const tribeMembers = findTribeMembers(human.id, context.gameState);
              const tribeStrength = calculateTribeStrength(tribeMembers);
              const enemyStrength = calculateTribeStrength(enemies);

              return tribeStrength > enemyStrength * LEADER_COMBAT_STRENGTH_ADVANTAGE_THRESHOLD;
            },
            'Is Strong Enough?',
            depth + 3,
          ),
          new ActionNode(
            (human: HumanEntity, context: UpdateContext) => {
              human.isCallingToAttack = true;
              human.callToAttackEndTime = context.gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
              // Cooldown is now handled by the CooldownNode wrapper

              addVisualEffect(
                context.gameState,
                VisualEffectType.CallToAttack,
                human.position,
                PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
              );
              playSoundAt(context, SoundType.CallToAttack, human.position);

              human.activeAction = 'idle';
              human.target = undefined;
              return NodeStatus.SUCCESS;
            },
            'Issue Call to Attack',
            depth + 3,
          ),
        ],
        'Attack',
        depth + 2,
      ),
      // Branch 2: Retreat, if not strong enough. This is the fallback.
      new ActionNode(
        (human, context, blackboard) => {
          const enemies = blackboard.get<HumanEntity[]>(ENEMIES_NEARBY_KEY);
          if (!enemies || enemies.length === 0) {
            return NodeStatus.FAILURE; // Should not happen if findEnemies succeeded.
          }

          const enemyPositions = enemies.map((e) => e.position);
          const enemyCenter = getAveragePosition(enemyPositions);

          const fleeVector = getDirectionVectorOnTorus(
            enemyCenter,
            human.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          const fleeDirection = vectorNormalize(fleeVector);
          const targetPosition = vectorAdd(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE * 2));

          human.activeAction = 'moving';
          human.target = {
            x:
              ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
              context.gameState.mapDimensions.width,
            y:
              ((targetPosition.y % context.gameState.mapDimensions.height) +
                context.gameState.mapDimensions.height) %
              context.gameState.mapDimensions.height,
          };
          human.direction = fleeDirection;

          return NodeStatus.SUCCESS;
        },
        'Retreat',
        depth + 2,
      ),
    ],
    'Attack or Retreat',
    depth + 2,
  );

  // The final behavior is a sequence of all the prerequisite checks followed by the decision logic,
  // which is wrapped in a CooldownNode.
  return new Sequence(
    [
      isLeader,
      isNotAlreadyCalling,
      findEnemies,
      new CooldownNode(
        LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS,
        attackOrRetreat,
        'Leader Combat Cooldown',
        depth + 1,
      ),
    ],
    'Leader Combat Strategy',
    depth,
  );
}
