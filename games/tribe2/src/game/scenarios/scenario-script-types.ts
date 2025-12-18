/**
 * TypeScript types for scenario scripting.
 *
 * This module defines the interfaces for creating custom scenario scripts that can:
 * - Display custom notifications at specific game events
 * - Track custom progress metrics
 * - Define win and fail conditions
 *
 * These are designed to be coded at the TypeScript level, not in JSON.
 */

import { GameWorldState } from '../world-types';
import { NotificationType } from '../notifications/notification-types';
import { EntityId } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { BuildingEntity } from '../entities/buildings/building-types';

/**
 * Represents the outcome of a scenario condition check.
 */
export type ScenarioConditionResult =
  | { triggered: false }
  | { triggered: true; message: string };

/**
 * A function that checks if a win condition is met.
 * Returns a result object indicating whether the condition was triggered
 * and an optional message to display.
 */
export type WinConditionFn = (state: GameWorldState) => ScenarioConditionResult;

/**
 * A function that checks if a fail condition is met.
 * Returns a result object indicating whether the condition was triggered
 * and an optional message to display.
 */
export type FailConditionFn = (state: GameWorldState) => ScenarioConditionResult;

/**
 * Progress metric definition.
 * Tracks a custom metric that can be displayed to the player.
 */
export interface ProgressMetric {
  /** Unique identifier for the metric */
  id: string;
  /** Display name shown to the player */
  name: string;
  /** Description of what this metric tracks */
  description: string;
  /** Function that calculates the current value */
  getValue: (state: GameWorldState) => number;
  /** Optional target value to reach */
  targetValue?: number;
  /** Optional function to format the display value */
  formatValue?: (value: number, target?: number) => string;
  /** Icon to display (emoji or character) */
  icon?: string;
}

/**
 * Custom notification trigger.
 * Defines when a custom notification should be shown.
 */
export interface NotificationTrigger {
  /** Unique identifier for the trigger */
  id: string;
  /** Function that checks if the notification should be triggered */
  shouldTrigger: (state: GameWorldState, previouslyTriggered: boolean) => boolean;
  /** Message to display when triggered */
  message: string;
  /** Notification type */
  type: NotificationType;
  /** Duration in game hours (0 = permanent until dismissed) */
  duration: number;
  /** Optional: should this trigger only once? */
  triggerOnce?: boolean;
  /** Optional: entity IDs to highlight */
  getHighlightedEntityIds?: (state: GameWorldState) => EntityId[];
  /** Optional: position to focus on */
  getTargetPosition?: (state: GameWorldState) => Vector2D | undefined;
}

/**
 * The complete scenario script definition.
 * This is the main interface for defining custom scenario behavior.
 */
export interface ScenarioScript {
  /** Unique identifier for the scenario */
  id: string;

  /** Display name of the scenario */
  name: string;

  /** Detailed description of the scenario */
  description: string;

  /** Version string for tracking changes */
  version: string;

  /**
   * Win conditions - any one of these being met ends the game with victory.
   * If empty, the scenario has no win condition (sandbox mode).
   */
  winConditions: WinConditionFn[];

  /**
   * Fail conditions - any one of these being met ends the game with failure.
   * The default fail condition (player death) is always active unless overridden.
   */
  failConditions: FailConditionFn[];

  /**
   * Progress metrics to track and display to the player.
   */
  progressMetrics: ProgressMetric[];

  /**
   * Custom notification triggers.
   */
  notificationTriggers: NotificationTrigger[];

  /**
   * Optional: Called once when the scenario starts.
   * Can be used to set up initial state or show welcome messages.
   */
  onStart?: (state: GameWorldState) => void;

  /**
   * Optional: Called every game update tick.
   * Use sparingly for performance - prefer notification triggers for event-based logic.
   */
  onUpdate?: (state: GameWorldState, deltaTime: number) => void;

  /**
   * Optional: Called when the scenario ends (win or fail).
   */
  onEnd?: (state: GameWorldState, result: 'win' | 'fail', message: string) => void;
}

/**
 * Runtime state for tracking scenario progress.
 */
export interface ScenarioRuntimeState {
  /** The scenario script being run */
  script: ScenarioScript;

  /** Whether the scenario has started */
  hasStarted: boolean;

  /** Whether the scenario has ended */
  hasEnded: boolean;

  /** Win/fail result if ended */
  result?: 'win' | 'fail';

  /** Result message if ended */
  resultMessage?: string;

  /** Tracks which notification triggers have fired (for triggerOnce) */
  triggeredNotifications: Set<string>;

  /** Current values of progress metrics (cached for performance) */
  metricValues: Record<string, number>;

  /** Last update time for metric caching */
  lastMetricUpdate: number;
}

/**
 * Creates an empty/sandbox scenario script.
 * Use this as a starting point for custom scenarios.
 */
export function createEmptyScenarioScript(name: string, description: string): ScenarioScript {
  return {
    id: `scenario-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name,
    description,
    version: '1.0.0',
    winConditions: [],
    failConditions: [],
    progressMetrics: [],
    notificationTriggers: [],
  };
}

/**
 * Creates the initial runtime state for a scenario.
 */
export function createScenarioRuntimeState(script: ScenarioScript): ScenarioRuntimeState {
  return {
    script,
    hasStarted: false,
    hasEnded: false,
    triggeredNotifications: new Set(),
    metricValues: {},
    lastMetricUpdate: 0,
  };
}

// ============================================================================
// COMMON WIN CONDITIONS
// ============================================================================

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
 * Creates a win condition that triggers when tribe population reaches a target.
 */
export function createPopulationWinCondition(targetPopulation: number): WinConditionFn {
  return (state: GameWorldState) => {
    const humans = getLivingHumans(state);
    const playerHuman = findPlayer(state);
    if (!playerHuman) return { triggered: false };

    const tribeMates = humans.filter(
      (h) => h.leaderId === playerHuman.leaderId || h.id === playerHuman.leaderId
    );

    if (tribeMates.length >= targetPopulation) {
      return {
        triggered: true,
        message: `Victory! Your tribe reached ${targetPopulation} members!`,
      };
    }
    return { triggered: false };
  };
}

/**
 * Creates a win condition that triggers when player survives for a duration.
 */
export function createSurvivalWinCondition(hoursToSurvive: number): WinConditionFn {
  return (state: GameWorldState) => {
    if (state.time >= hoursToSurvive) {
      const days = Math.floor(hoursToSurvive / 24);
      return {
        triggered: true,
        message: `Victory! You survived for ${days} days!`,
      };
    }
    return { triggered: false };
  };
}

/**
 * Creates a win condition that triggers when player controls a certain territory.
 */
export function createTerritoryWinCondition(targetTiles: number): WinConditionFn {
  return (state: GameWorldState) => {
    const playerHuman = findPlayer(state);
    if (!playerHuman) return { triggered: false };

    const ownedTiles = state.terrainOwnership.filter(
      (owner) => owner === playerHuman.leaderId || owner === playerHuman.id
    ).length;

    if (ownedTiles >= targetTiles) {
      return {
        triggered: true,
        message: `Victory! Your tribe controls ${ownedTiles} territory tiles!`,
      };
    }
    return { triggered: false };
  };
}

/**
 * Creates a win condition that triggers when all predators are eliminated.
 */
export function createEliminatePredatorsWinCondition(): WinConditionFn {
  return (state: GameWorldState) => {
    const predators = Object.values(state.entities.entities).filter(
      (e) => e.type === 'predator' && (e as PredatorEntity).hitpoints > 0
    );

    if (predators.length === 0) {
      return {
        triggered: true,
        message: 'Victory! All predators have been eliminated!',
      };
    }
    return { triggered: false };
  };
}

// ============================================================================
// COMMON FAIL CONDITIONS
// ============================================================================

/**
 * Default fail condition: player dies.
 */
export function createPlayerDeathFailCondition(): FailConditionFn {
  return (state: GameWorldState) => {
    const playerHuman = findPlayer(state);

    if (!playerHuman || playerHuman.hitpoints <= 0) {
      return {
        triggered: true,
        message: 'Game Over! Your character has died.',
      };
    }
    return { triggered: false };
  };
}

/**
 * Creates a fail condition that triggers when entire tribe is eliminated.
 * Note: Tracks tribe by the original player's leaderId, not by badge.
 */
export function createTribeEliminatedFailCondition(): FailConditionFn {
  let playerLeaderId: EntityId | undefined;

  return (state: GameWorldState) => {
    const humans = getLivingHumans(state);
    const playerHuman = humans.find((h) => h.isPlayer);

    // Track the player's tribe leader ID when they're alive
    if (playerHuman) {
      playerLeaderId = playerHuman.leaderId || playerHuman.id;
      return { triggered: false };
    }

    // Player is dead - check if any tribe mates remain
    if (playerLeaderId) {
      const survivingTribeMembers = humans.filter(
        (h) => h.leaderId === playerLeaderId || h.id === playerLeaderId
      );
      if (survivingTribeMembers.length === 0) {
        return {
          triggered: true,
          message: 'Game Over! Your entire tribe has been eliminated.',
        };
      }
    }

    return { triggered: false };
  };
}

/**
 * Creates a fail condition that triggers after a time limit.
 */
export function createTimeLimitFailCondition(hoursLimit: number): FailConditionFn {
  return (state: GameWorldState) => {
    if (state.time >= hoursLimit) {
      const days = Math.floor(hoursLimit / 24);
      return {
        triggered: true,
        message: `Game Over! Time limit of ${days} days reached.`,
      };
    }
    return { triggered: false };
  };
}

// ============================================================================
// COMMON PROGRESS METRICS
// ============================================================================

/**
 * Creates a population progress metric.
 */
export function createPopulationMetric(target?: number): ProgressMetric {
  return {
    id: 'population',
    name: 'Population',
    description: 'Number of tribe members',
    icon: '👥',
    targetValue: target,
    getValue: (state: GameWorldState) => {
      const humans = getLivingHumans(state);
      const playerHuman = findPlayer(state);
      if (!playerHuman) return 0;

      return humans.filter(
        (h) => h.leaderId === playerHuman.leaderId || h.id === playerHuman.leaderId
      ).length;
    },
    formatValue: (value, target) =>
      target ? `${value}/${target}` : `${value}`,
  };
}

/**
 * Creates a days survived progress metric.
 */
export function createDaysSurvivedMetric(target?: number): ProgressMetric {
  return {
    id: 'days-survived',
    name: 'Days Survived',
    description: 'Number of days your tribe has survived',
    icon: '☀️',
    targetValue: target,
    getValue: (state: GameWorldState) => Math.floor(state.time / 24),
    formatValue: (value, target) =>
      target ? `${value}/${target} days` : `${value} days`,
  };
}

/**
 * Creates a territory progress metric.
 */
export function createTerritoryMetric(target?: number): ProgressMetric {
  return {
    id: 'territory',
    name: 'Territory',
    description: 'Number of territory tiles controlled',
    icon: '🏴',
    targetValue: target,
    getValue: (state: GameWorldState) => {
      const playerHuman = findPlayer(state);
      if (!playerHuman) return 0;

      return state.terrainOwnership.filter(
        (owner) => owner === playerHuman.leaderId || owner === playerHuman.id
      ).length;
    },
    formatValue: (value, target) =>
      target ? `${value}/${target}` : `${value} tiles`,
  };
}

/**
 * Creates a predators eliminated progress metric.
 */
export function createPredatorsEliminatedMetric(initialCount: number): ProgressMetric {
  return {
    id: 'predators-eliminated',
    name: 'Predators Eliminated',
    description: 'Number of predators killed',
    icon: '🐺',
    targetValue: initialCount,
    getValue: (state: GameWorldState) => {
      const currentPredators = Object.values(state.entities.entities).filter(
        (e) => e.type === 'predator' && (e as PredatorEntity).hitpoints > 0
      ).length;
      return initialCount - currentPredators;
    },
    formatValue: (value, target) =>
      target ? `${value}/${target}` : `${value}`,
  };
}

// ============================================================================
// COMMON NOTIFICATION TRIGGERS
// ============================================================================

/**
 * Creates a notification trigger for low food warning.
 */
export function createLowFoodNotificationTrigger(): NotificationTrigger {
  return {
    id: 'low-food-warning',
    type: NotificationType.Hello, // Could be a custom type
    message: '⚠️ Your tribe is running low on food! Gather more berries or hunt prey.',
    duration: 12, // 12 game hours
    triggerOnce: false,
    shouldTrigger: (state: GameWorldState, previouslyTriggered: boolean) => {
      // Don't spam the notification
      if (previouslyTriggered) return false;

      const playerHuman = findPlayer(state);
      if (!playerHuman) return false;

      // Check if player's hunger is high
      return playerHuman.hunger > 70;
    },
  };
}

/**
 * Creates a notification trigger for first building constructed.
 */
export function createFirstBuildingNotificationTrigger(): NotificationTrigger {
  return {
    id: 'first-building',
    type: NotificationType.Hello,
    message: '🏗️ Your first building is complete! This establishes territory for your tribe.',
    duration: 24,
    triggerOnce: true,
    shouldTrigger: (state: GameWorldState) => {
      const playerHuman = findPlayer(state);
      if (!playerHuman) return false;

      const playerId = playerHuman.leaderId || playerHuman.id;
      const buildings = Object.values(state.entities.entities).filter(
        (e) =>
          e.type === 'building' &&
          (e as BuildingEntity).isConstructed &&
          (e as BuildingEntity).ownerId === playerId
      );

      return buildings.length > 0;
    },
  };
}

/**
 * Creates a notification trigger for predator nearby warning.
 */
export function createPredatorNearbyNotificationTrigger(warningDistance: number = 200): NotificationTrigger {
  return {
    id: 'predator-nearby',
    type: NotificationType.Hello,
    message: '🐺 Warning! A predator is nearby!',
    duration: 6,
    triggerOnce: false,
    shouldTrigger: (state: GameWorldState, previouslyTriggered: boolean) => {
      if (previouslyTriggered) return false;

      const playerHuman = findPlayer(state);
      if (!playerHuman) return false;

      const predators = Object.values(state.entities.entities).filter(
        (e) => e.type === 'predator' && (e as PredatorEntity).hitpoints > 0
      );

      for (const predator of predators) {
        const dx = predator.position.x - playerHuman.position.x;
        const dy = predator.position.y - playerHuman.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < warningDistance) {
          return true;
        }
      }
      return false;
    },
    getHighlightedEntityIds: (state: GameWorldState) => {
      const playerHuman = findPlayer(state);
      if (!playerHuman) return [];

      const nearbyPredators = Object.values(state.entities.entities).filter((e) => {
        if (e.type !== 'predator' || (e as PredatorEntity).hitpoints <= 0) return false;
        const dx = e.position.x - playerHuman.position.x;
        const dy = e.position.y - playerHuman.position.y;
        return Math.sqrt(dx * dx + dy * dy) < warningDistance;
      });

      return nearbyPredators.map((p) => p.id);
    },
  };
}
