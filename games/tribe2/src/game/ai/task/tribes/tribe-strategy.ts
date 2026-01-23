import { HumanEntity } from '../../../entities/characters/human/human-types';
import { StrategicObjective } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import {
  calculateTribeFoodSecurity,
  getTribeWoodNeed,
  getProductiveBushes,
} from '../../../entities/tribe/tribe-food-utils';
import { findNearbyEnemiesOfTribe } from '../../../utils/ai-world-analysis-utils';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils';

const STRATEGY_CHANGE_COOLDOWN = 12; // Hours

/**
 * Periodically re-evaluates and updates the strategic objective for an AI tribe leader.
 * The objective influences task scoring for all tribe members.
 */
export function updateTribeStrategy(leader: HumanEntity, gameState: IndexedWorldState): void {
  if (!leader.tribeControl || leader.isPlayer) {
    return;
  }

  // Check cooldown to avoid rapid strategy flipping
  const lastUpdate = (leader.aiBlackboard.data['lastStrategyChangeTime'] as number) || 0;
  if (gameState.time - lastUpdate < STRATEGY_CHANGE_COOLDOWN) {
    return;
  }

  const foodSecurity = calculateTribeFoodSecurity(leader, gameState);
  const woodNeed = getTribeWoodNeed(leader.id, gameState);
  const members = getTribeMembers(leader, gameState);
  const adultCount = members.filter((m) => m.isAdult).length;
  const { ratio: bushRatio } = getProductiveBushes(leader.id, gameState);
  const nearbyEnemies = findNearbyEnemiesOfTribe(leader, gameState, 600);

  let nextObjective = StrategicObjective.None;

  // Decision Priority Tree
  if (nearbyEnemies.length > 0) {
    nextObjective = StrategicObjective.ActiveDefense;
  } else if (foodSecurity < 0.3) {
    nextObjective = StrategicObjective.GreatHarvest;
  } else if (woodNeed > adultCount * 2) {
    nextObjective = StrategicObjective.LumberjackFever;
  } else if (bushRatio < 2 && foodSecurity > 0.5) {
    nextObjective = StrategicObjective.GreenThumb;
  } else if (adultCount < 10 && foodSecurity > 0.8) {
    nextObjective = StrategicObjective.BabyBoom;
  } else if (foodSecurity > 0.7 && woodNeed < 5) {
    // If stable, expand or fortify
    nextObjective = Math.random() > 0.5 ? StrategicObjective.ManifestDestiny : StrategicObjective.IronCurtain;
  }

  if (leader.tribeControl.strategicObjective !== nextObjective) {
    leader.tribeControl.strategicObjective = nextObjective;
    leader.aiBlackboard.data['lastStrategyChangeTime'] = gameState.time;
  }
}
