import { BT_EXPENSIVE_OPERATION_CACHE_HOURS } from '../../../ai-consts.ts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, CachingNode } from '../nodes';

/**
 * Creates a behavior that assigns or reassigns a tribe role to a human
 * based on the tribe's role weights and current population distribution.
 */
export function createTribeRoleAssignmentBehavior(debugDepth: number): BehaviorNode<HumanEntity> {
  const action = new ActionNode<HumanEntity>(
    (human, context) => {
      // 1. Check if human has a leader
      if (!human.leaderId) {
        return NodeStatus.FAILURE;
      }

      // 2. Must be adult
      if (!human.isAdult) {
        return NodeStatus.FAILURE;
      }

      // 3. Get the leader entity
      const leader = context.gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
      if (!leader || !leader.tribeControl) {
        return NodeStatus.FAILURE;
      }

      // 4. Check if this is a player-controlled leader and roleManagement autopilot is disabled
      if (leader.isPlayer && !context.gameState.autopilotControls.behaviors.roleManagement) {
        return [NodeStatus.FAILURE, 'Player leader with roleManagement autopilot disabled'];
      }

      // 5. If I am the leader, ensure my role is Leader and exit
      if (human.id === leader.id) {
        if (human.tribeRole !== TribeRole.Leader) {
          human.tribeRole = TribeRole.Leader;
        }
        return NodeStatus.SUCCESS;
      }

      // 6. Get all tribe members to calculate distribution
      const tribeMembers = getTribeMembers(leader, context.gameState);
      const nonLeaderMembers = tribeMembers.filter((m) => m.id !== leader.id);
      const totalNonLeaders = nonLeaderMembers.length;

      if (totalNonLeaders === 0) {
        return NodeStatus.SUCCESS;
      }

      // 7. Calculate target counts based on weights
      const weights = leader.tribeControl.roleWeights;
      let totalWeight = 0;
      const availableRoles: TribeRole[] = [];

      // Filter out Leader role from weights for assignment
      for (const role of Object.values(TribeRole)) {
        if (role !== TribeRole.Leader) {
          totalWeight += weights[role] || 0;
          availableRoles.push(role);
        }
      }

      if (totalWeight === 0) {
        // Fallback if no weights: assign Gatherer
        if (!human.tribeRole) {
          human.tribeRole = TribeRole.Gatherer;
        }
        return NodeStatus.SUCCESS;
      }

      // Calculate deficits: Target - Current
      const currentCounts: Record<string, number> = {};
      const targetCounts: Record<string, number> = {};
      const deficits: Record<string, number> = {};

      // Initialize counts
      for (const role of availableRoles) {
        currentCounts[role] = 0;
        targetCounts[role] = (weights[role] / totalWeight) * totalNonLeaders;
      }

      // Count current roles
      for (const member of nonLeaderMembers) {
        if (member.tribeRole && member.tribeRole !== TribeRole.Leader) {
          currentCounts[member.tribeRole] = (currentCounts[member.tribeRole] || 0) + 1;
        }
      }

      // Calculate deficits
      for (const role of availableRoles) {
        deficits[role] = targetCounts[role] - currentCounts[role];
      }

      // 8. Check if we need to assign or reassign
      let needsAssignment = false;

      if (!human.tribeRole || human.tribeRole === TribeRole.Leader) {
        // No role, or incorrectly has Leader role
        needsAssignment = true;
      } else {
        // Has a role, check if it's over-represented
        // If my role has a surplus (deficit < -0.5) AND there is another role with a deficit (deficit > 0.5)
        // We use 0.5 as a threshold to avoid jitter around integer boundaries
        const myRoleDeficit = deficits[human.tribeRole];
        if (myRoleDeficit < -0.5) {
          // My role is over-represented. Is there a better option?
          const hasUnderRepresentedRole = availableRoles.some((r) => deficits[r] > 0.5);
          if (hasUnderRepresentedRole) {
            needsAssignment = true;
          }
        }
      }

      // 9. Assign new role if needed
      if (needsAssignment) {
        // Pick a role based on deficits.
        // We only consider roles that have a "positive need" (deficit > -something).
        // To make it robust, we can use weighted random based on weights,
        // but prioritizing those with higher deficits.
        // Simple approach: Pick the role with the highest deficit.

        let bestRole: TribeRole | null = null;
        let maxDeficit = -Infinity;

        // Sort available roles by deficit descending to find the most needed one
        // Add some randomness to break ties and avoid everyone switching to the same role at once
        const shuffledRoles = [...availableRoles].sort(() => Math.random() - 0.5);

        for (const role of shuffledRoles) {
          const deficit = deficits[role];
          if (deficit > maxDeficit) {
            maxDeficit = deficit;
            bestRole = role;
          }
        }

        if (bestRole) {
          human.tribeRole = bestRole;
        } else {
          // Fallback: just pick based on raw weights if everything is balanced
          const randomVal = Math.random() * totalWeight;
          let cumulative = 0;
          for (const role of availableRoles) {
            cumulative += weights[role];
            if (randomVal <= cumulative) {
              human.tribeRole = role;
              break;
            }
          }
        }
      }

      return NodeStatus.SUCCESS;
    },
    'Assign Tribe Role',
    debugDepth + 1,
  );

  return new CachingNode(action, BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Tribe Role Assignment', debugDepth);
}
