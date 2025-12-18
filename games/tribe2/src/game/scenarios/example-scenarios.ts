/**
 * Example scenario scripts demonstrating the scenario scripting system.
 *
 * These examples show how to create custom scenarios with:
 * - Win/fail conditions
 * - Progress tracking
 * - Custom notifications
 */

import { NotificationType } from '../notifications/notification-types';
import {
  ScenarioScript,
  createPopulationWinCondition,
  createSurvivalWinCondition,
  createEliminatePredatorsWinCondition,
  createPlayerDeathFailCondition,
  createTimeLimitFailCondition,
  createPopulationMetric,
  createDaysSurvivedMetric,
  createPredatorsEliminatedMetric,
  createLowFoodNotificationTrigger,
  createPredatorNearbyNotificationTrigger,
} from './scenario-script-types';
import { addNotification } from '../notifications/notification-utils';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { GameWorldState } from '../world-types';

/**
 * Helper to get all living humans from game state.
 */
function getLivingHumans(state: GameWorldState): HumanEntity[] {
  return Object.values(state.entities.entities).filter(
    (e) => e.type === 'human' && (e as HumanEntity).hitpoints > 0
  ) as HumanEntity[];
}

/**
 * Helper to find the player human.
 */
function findPlayer(state: GameWorldState): HumanEntity | undefined {
  return getLivingHumans(state).find((h) => h.isPlayer);
}

/**
 * Example 1: Survival Challenge
 *
 * Objective: Survive for 30 days
 * - Win when 30 days pass
 * - Fail on player death
 */
export const survivalChallengeScript: ScenarioScript = {
  id: 'survival-challenge',
  name: 'Survival Challenge',
  description: 'Survive for 30 days in a world filled with predators. Can you outlast the dangers?',
  version: '1.0.0',

  winConditions: [createSurvivalWinCondition(30 * 24)], // 30 days

  failConditions: [createPlayerDeathFailCondition()],

  progressMetrics: [
    createDaysSurvivedMetric(30),
    createPopulationMetric(),
  ],

  notificationTriggers: [
    createPredatorNearbyNotificationTrigger(150),
    createLowFoodNotificationTrigger(),
    {
      id: 'halfway-milestone',
      type: NotificationType.Hello,
      message: '🎉 Halfway there! You have survived 15 days!',
      duration: 24,
      triggerOnce: true,
      shouldTrigger: (state) => state.time >= 15 * 24,
    },
  ],

  onStart: (state) => {
    addNotification(state, {
      type: NotificationType.Hello,
      message: '🏕️ Welcome to the Survival Challenge! Survive for 30 days to win.',
      duration: 48,
    });
  },

  onEnd: (_state, result, message) => {
    console.log(`Scenario ended: ${result} - ${message}`);
  },
};

/**
 * Example 2: Population Growth
 *
 * Objective: Grow your tribe to 20 members
 * - Win when population reaches 20
 * - Fail on player death or after 100 days
 */
export const populationGrowthScript: ScenarioScript = {
  id: 'population-growth',
  name: 'Growing Tribe',
  description: 'Build a thriving tribe with 20 members. Balance survival with reproduction.',
  version: '1.0.0',

  winConditions: [createPopulationWinCondition(20)],

  failConditions: [
    createPlayerDeathFailCondition(),
    createTimeLimitFailCondition(100 * 24), // 100 days
  ],

  progressMetrics: [
    createPopulationMetric(20),
    createDaysSurvivedMetric(),
  ],

  notificationTriggers: [
    createLowFoodNotificationTrigger(),
    {
      id: 'first-child',
      type: NotificationType.Hello,
      message: '👶 Your tribe has welcomed its first child! Keep growing!',
      duration: 24,
      triggerOnce: true,
      // Triggers when tribe size increases (assumes initial tribe of 2, triggers at 3+)
      shouldTrigger: (state) => {
        const humans = getLivingHumans(state);
        const playerHuman = findPlayer(state);
        if (!playerHuman) return false;

        const tribeMates = humans.filter(
          (h) => h.leaderId === playerHuman.leaderId || h.id === playerHuman.leaderId
        );
        // Threshold of 3 works for typical starting conditions (1-2 members)
        return tribeMates.length >= 3;
      },
    },
    {
      id: 'population-10',
      type: NotificationType.Hello,
      message: '🎊 Your tribe has reached 10 members! Only 10 more to go!',
      duration: 24,
      triggerOnce: true,
      shouldTrigger: (state) => {
        const humans = getLivingHumans(state);
        const playerHuman = findPlayer(state);
        if (!playerHuman) return false;

        const tribeMates = humans.filter(
          (h) => h.leaderId === playerHuman.leaderId || h.id === playerHuman.leaderId
        );
        return tribeMates.length >= 10;
      },
    },
  ],

  onStart: (state) => {
    addNotification(state, {
      type: NotificationType.Hello,
      message: '👨‍👩‍👧‍👦 Welcome! Grow your tribe to 20 members to achieve victory.',
      duration: 48,
    });
  },
};

/**
 * Example 3: Predator Hunter
 *
 * Objective: Eliminate all predators
 * - Win when all predators are dead
 * - Fail on player death
 */
export function createPredatorHunterScript(initialPredatorCount: number): ScenarioScript {
  return {
    id: 'predator-hunter',
    name: 'Predator Hunter',
    description: 'The land is overrun with predators. Hunt them all to make the world safe.',
    version: '1.0.0',

    winConditions: [createEliminatePredatorsWinCondition()],

    failConditions: [createPlayerDeathFailCondition()],

    progressMetrics: [
      createPredatorsEliminatedMetric(initialPredatorCount),
      createDaysSurvivedMetric(),
    ],

    notificationTriggers: [
      createPredatorNearbyNotificationTrigger(200),
      {
        id: 'first-kill',
        type: NotificationType.Hello,
        message: '🗡️ You killed your first predator! Keep hunting!',
        duration: 24,
        triggerOnce: true,
        shouldTrigger: (state) => {
          const currentPredators = Object.values(state.entities.entities).filter(
            (e) => e.type === 'predator' && (e as PredatorEntity).hitpoints > 0
          ).length;
          return currentPredators < initialPredatorCount;
        },
      },
      {
        id: 'halfway-kills',
        type: NotificationType.Hello,
        message: '⚔️ Halfway done! Keep eliminating predators!',
        duration: 24,
        triggerOnce: true,
        shouldTrigger: (state) => {
          const currentPredators = Object.values(state.entities.entities).filter(
            (e) => e.type === 'predator' && (e as PredatorEntity).hitpoints > 0
          ).length;
          return currentPredators <= Math.floor(initialPredatorCount / 2);
        },
      },
    ],

    onStart: (state) => {
      addNotification(state, {
        type: NotificationType.Hello,
        message: `🐺 ${initialPredatorCount} predators roam this land. Hunt them all to win!`,
        duration: 48,
      });
    },
  };
}

/**
 * Example 4: Child of the Tribe
 *
 * The player starts as a child in an existing tribe.
 * Must survive until adulthood.
 */
export const childOfTheTribeScript: ScenarioScript = {
  id: 'child-of-tribe',
  name: 'Child of the Tribe',
  description: 'You are born into a tribe. Survive childhood and become an adult (age 18).',
  version: '1.0.0',

  winConditions: [
    (state) => {
      const player = findPlayer(state);
      if (!player) return { triggered: false };

      // Check if player reached adulthood
      const ageInYears = player.age || 0;
      if (ageInYears >= 18) {
        return {
          triggered: true,
          message: 'Victory! You have reached adulthood!',
        };
      }
      return { triggered: false };
    },
  ],

  failConditions: [createPlayerDeathFailCondition()],

  progressMetrics: [
    {
      id: 'player-age',
      name: 'Age',
      description: 'Your current age',
      icon: '🎂',
      targetValue: 18,
      getValue: (state) => {
        const player = findPlayer(state);
        return player ? player.age || 0 : 0;
      },
      formatValue: (value, target) => `${Math.floor(value)}/${target} years`,
    },
  ],

  notificationTriggers: [
    {
      id: 'age-10',
      type: NotificationType.Hello,
      message: '🎈 Happy 10th birthday! You are halfway to adulthood!',
      duration: 24,
      triggerOnce: true,
      shouldTrigger: (state) => {
        const player = findPlayer(state);
        return player ? player.age >= 10 : false;
      },
    },
    {
      id: 'age-15',
      type: NotificationType.Hello,
      message: '🎉 You turned 15! Only 3 more years until adulthood!',
      duration: 24,
      triggerOnce: true,
      shouldTrigger: (state) => {
        const player = findPlayer(state);
        return player ? player.age >= 15 : false;
      },
    },
  ],

  onStart: (state) => {
    addNotification(state, {
      type: NotificationType.Hello,
      message: '👶 You are a child in this tribe. Survive until you reach adulthood (age 18)!',
      duration: 48,
    });
  },
};

/**
 * List of all available scenario scripts.
 */
export const availableScenarios: ScenarioScript[] = [
  survivalChallengeScript,
  populationGrowthScript,
  childOfTheTribeScript,
];
