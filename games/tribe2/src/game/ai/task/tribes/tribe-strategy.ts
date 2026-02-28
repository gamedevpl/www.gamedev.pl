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

// Food security thresholds for strategy decisions
const FOOD_SECURITY_CRITICAL = 0.5; // Trigger GreatHarvest when below 50%
const FOOD_SECURITY_STABLE = 0.6; // Need at least 60% for BabyBoom
const FOOD_SECURITY_PROSPEROUS = 0.7; // Need at least 70% for expansion

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

  // Decision Priority Tree - prioritize survival over growth
  if (nearbyEnemies.length > 0) {
    nextObjective = StrategicObjective.ActiveDefense;
  } else if (foodSecurity < FOOD_SECURITY_CRITICAL) {
    // Focus on food gathering when food is low (increased from 0.3 to 0.5)
    nextObjective = StrategicObjective.GreatHarvest;
  } else if (woodNeed > adultCount * 2) {
    nextObjective = StrategicObjective.LumberjackFever;
  } else if (bushRatio < 2 && foodSecurity > FOOD_SECURITY_CRITICAL) {
    // Plant more bushes when we have some food security
    nextObjective = StrategicObjective.GreenThumb;
  } else if (adultCount < 10 && foodSecurity > FOOD_SECURITY_STABLE) {
    // Only focus on reproduction when food is stable (lowered from 0.8 to 0.6)
    nextObjective = StrategicObjective.BabyBoom;
  } else if (foodSecurity > FOOD_SECURITY_PROSPEROUS && woodNeed < 5) {
    // If prosperous, expand or fortify
    nextObjective = Math.random() > 0.5 ? StrategicObjective.ManifestDestiny : StrategicObjective.IronCurtain;
  }

  if (leader.tribeControl.strategicObjective !== nextObjective) {
    leader.tribeControl.strategicObjective = nextObjective;
    leader.aiBlackboard.data['lastStrategyChangeTime'] = gameState.time;
  }
}
