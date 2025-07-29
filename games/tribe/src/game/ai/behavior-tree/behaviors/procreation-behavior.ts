import {
  BT_PROCREATION_SEARCH_COOLDOWN_HOURS,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_PROXIMITY,
  HUMAN_MIN_PROCREATION_AGE,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
  PROCREATION_PARTNER_SEARCH_RADIUS_LONG,
  AI_PROCREATION_AVOID_PARTNER_PROXIMITY,
  PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import {
  countEntitiesOfTypeInRadius,
  findPotentialNewPartners,
  findChildren,
  findHeir,
  canProcreate,
} from '../../../utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard';

const PROCREATION_WANDER_START_TIME_KEY = 'procreationWanderStartTime';

// Helper function to find a valid partner from a list of potentials
const findValidPartner = (human: HumanEntity, potentials: HumanEntity[]): HumanEntity | undefined => {
  return potentials.find((p) => canProcreate(human, p));
};

export function createProcreationBehavior(depth: number): BehaviorNode {
  const findImmediatePartner = new ConditionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const potentialPartners = findPotentialNewPartners(human, context.gameState, HUMAN_INTERACTION_PROXIMITY);
      const partner = findValidPartner(human, potentialPartners);
      if (partner) {
        blackboard.set('procreationPartner', partner);
        return true;
      }
      return false;
    },
    'Find Immediate Partner',
  );

  const startProcreating = new ActionNode((human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
    const partner = blackboard.get<HumanEntity>('procreationPartner');
    if (!partner) {
      return NodeStatus.FAILURE;
    }
    human.activeAction = 'procreating';
    human.target = undefined;
    // Cleanup blackboard state
    blackboard.delete('procreationPartner');
    blackboard.delete(PROCREATION_WANDER_START_TIME_KEY);

    if (!human.partnerIds?.includes(partner.id)) {
      human.partnerIds = human.partnerIds ? [...human.partnerIds, partner.id] : [partner.id];
    }
    return NodeStatus.SUCCESS;
  }, 'Start Procreating');

  const locateDistantPartner = new ConditionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const potentialPartners = findPotentialNewPartners(
        human,
        context.gameState,
        PROCREATION_PARTNER_SEARCH_RADIUS_LONG,
      );
      const partner = findValidPartner(human, potentialPartners);
      if (partner) {
        blackboard.set('procreationPartner', partner);
        return true;
      }
      return false;
    },
    'Locate Distant Partner',
  );

  const moveTowardsPartner = new ActionNode((human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
    const partner = blackboard.get<HumanEntity>('procreationPartner');
    if (!partner) {
      return NodeStatus.FAILURE;
    }
    const distance = calculateWrappedDistance(
      human.position,
      partner.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    if (distance < HUMAN_INTERACTION_PROXIMITY) {
      return NodeStatus.SUCCESS;
    }
    human.activeAction = 'moving';
    human.target = partner.id;
    const dirToTarget = getDirectionVectorOnTorus(
      human.position,
      partner.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    human.direction = vectorNormalize(dirToTarget);
    return NodeStatus.RUNNING;
  }, 'Move Towards Partner');

  return new Sequence(
    [
      // Basic conditions to even consider procreating
      new ConditionNode(
        (human: HumanEntity) => {
          if (!human.isAdult || (human.gender === 'female' && human.isPregnant)) return false;
          if (
            human.age < HUMAN_MIN_PROCREATION_AGE ||
            (human.gender === 'female' && human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE)
          )
            return false;
          return true;
        },
        'Is Fertile (age, not pregnant)',
        depth + 1,
      ),

      new ConditionNode(
        (human: HumanEntity) => human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL,
        'Is Healthy (hunger)',
        depth + 1,
      ),

      new ConditionNode(
        (human: HumanEntity) => (human.procreationCooldown || 0) <= 0,
        'Is Ready (cooldown)',
        depth + 1,
      ),

      // New Selector: Either the environment is viable, OR the male is desperate to have an heir.
      new Selector(
        [
          // Branch 1: Standard food check
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  const nearbyBushes = countEntitiesOfTypeInRadius(
                    human.position,
                    context.gameState,
                    'berryBush',
                    PROCREATION_FOOD_SEARCH_RADIUS,
                  );
                  return nearbyBushes >= PROCREATION_MIN_NEARBY_BERRY_BUSHES;
                },
                'Is Environment Viable (food)',
                depth + 3,
              ),
              new ActionNode(
                (_human, _context, blackboard) => {
                  blackboard.delete(PROCREATION_WANDER_START_TIME_KEY);
                  return NodeStatus.SUCCESS;
                },
                'Clear Wander Timer',
                depth + 3,
              ),
            ],
            'Sufficient Food Path',
            depth + 2,
          ),
          // Branch 2: Heirless male desperation check
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  if (human.gender === 'male') {
                    const children = findChildren(context.gameState, human);
                    const heir = findHeir(children);
                    return !heir;
                  }
                  return false;
                },
                'Is Male Without Heir',
                depth + 3,
              ),
              new ActionNode(
                (_human, context, blackboard) => {
                  const wanderStartTime = blackboard.get<number>(PROCREATION_WANDER_START_TIME_KEY);
                  if (wanderStartTime === undefined) {
                    blackboard.set(PROCREATION_WANDER_START_TIME_KEY, context.gameState.time);
                    return [NodeStatus.FAILURE, 'Starting heirless wander timer'];
                  }
                  const elapsed = context.gameState.time - wanderStartTime;
                  if (elapsed >= PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS) {
                    return [NodeStatus.SUCCESS, `Wandered for ${elapsed.toFixed(1)}h, proceeding without food`];
                  }
                  return [NodeStatus.FAILURE, `Wandering for heir, ${elapsed.toFixed(1)}h elapsed`];
                },
                'Check Wander Timer',
                depth + 3,
              ),
            ],
            'Heirless Desperation Path',
            depth + 2,
          ),
        ],
        'Check Environment Or Desperation',
        depth + 1,
      ),

      // New condition: Avoid procreating if the potential partner's primary partner is nearby
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const potentialPartner = blackboard.get<HumanEntity>('procreationPartner');
          if (
            potentialPartner &&
            potentialPartner.partnerIds?.length &&
            !potentialPartner.partnerIds.includes(human.id)
          ) {
            if (
              potentialPartner.partnerIds
                .map((pid) => context.gameState.entities.entities.get(pid))
                .filter((p) => !!p)
                .some(
                  (p) =>
                    calculateWrappedDistance(
                      human.position,
                      p.position,
                      context.gameState.mapDimensions.width,
                      context.gameState.mapDimensions.height,
                    ) < AI_PROCREATION_AVOID_PARTNER_PROXIMITY,
                )
            ) {
              return [false, "Partner's primary partner is too close"];
            }
          }
          return true;
        },
        "Is Partner's Primary Partner Nearby",
        depth + 1,
      ),

      // --- Find Partner and Procreate logic ---
      new Selector(
        [
          // Branch 1: Try to procreate with a partner that is already close
          new Sequence([findImmediatePartner, startProcreating], 'Procreate With Immediate Partner', depth + 2),
          // Branch 2: If no immediate partner, find a distant one and move towards them
          new CooldownNode(
            BT_PROCREATION_SEARCH_COOLDOWN_HOURS,
            new Sequence([locateDistantPartner, moveTowardsPartner], 'Seek Distant Partner Action', depth + 3),
            'Seek Distant Partner Cooldown',
            depth + 2,
          ),
        ],
        'Find Partner And Procreate',
        depth + 1,
      ),
    ],
    'Procreate',
    depth,
  );
}
