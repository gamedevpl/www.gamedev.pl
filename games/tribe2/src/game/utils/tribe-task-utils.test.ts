import { describe, expect, it } from 'vitest';
import { createEntities, createHuman, createBerryBush } from '../entities/entities-update';
import { indexWorldState } from '../world-index/world-state-index';
import { DebugPanelType, GameWorldState } from '../world-types';
import {
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_PROCREATION_COOLDOWN,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
} from '../animal-consts';
import { MIN_BERRY_BUSH_SPREAD_CHANCE } from '../berry-bush-consts';
import { getTribeLeaderForCoordination, TribalTaskData } from './tribe-task-utils';
import { createGatheringBehavior } from '../ai/behavior-tree/behaviors/gathering-behavior';
import { NodeStatus } from '../ai/behavior-tree/behavior-tree-types';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING } from '../ai-consts';

const mapDimensions = { width: 500, height: 500 };

function buildIndexedState(entities: ReturnType<typeof createEntities>) {
  const baseState: GameWorldState = {
    time: 0,
    entities,
    mapDimensions,
    generationCount: 1,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    viewportCenter: { x: 0, y: 0 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: true,
        planting: true,
        gathering: true,
        attack: true,
        feedChildren: true,
        followLeader: true,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    buildMenuOpen: false,
    selectedBuildingType: null,
    selectedBuildingForRemoval: null,
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: 1,
    isMuted: false,
    uiButtons: [],
    tutorial: {} as any,
    tutorialState: {} as any,
    debugPanel: DebugPanelType.None,
    performanceMetrics: {
      currentBucket: { renderTime: 0, worldUpdateTime: 0, aiUpdateTime: 0 },
      history: [],
    },
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [],
    ecosystem: {
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
    },
    autosaveIntervalSeconds: 0,
    lastAutosaveTime: 0,
  };

  return indexWorldState(baseState);
}

const extractStatus = (result: NodeStatus | [NodeStatus, string]) => (Array.isArray(result) ? result[0] : result);

describe('tribe task coordination fallback', () => {
  it('still coordinates tribe tasks when the original leader is missing', () => {
    const entities = createEntities();
    const missingLeaderId = 999;

    const bush = createBerryBush(entities, { x: 0, y: 0 }, 0);

    const elder = createHuman(
      entities,
      { x: 100, y: 0 },
      0,
      'male',
      false,
      35,
      HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 5,
      undefined,
      undefined,
      [],
      missingLeaderId,
      'X',
    );
    const adult = createHuman(
      entities,
      { x: 140, y: 0 },
      0,
      'female',
      false,
      28,
      HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING + 5,
      undefined,
      undefined,
      [],
      missingLeaderId,
      'X',
    );

    const indexedState = buildIndexedState(entities);
    const gatheringBehavior = createGatheringBehavior(0);
    const context = { gameState: indexedState, deltaTime: 1 };

    const coordinatorForElder = getTribeLeaderForCoordination(elder, indexedState);
    const coordinatorForAdult = getTribeLeaderForCoordination(adult, indexedState);

    expect(coordinatorForElder?.id).toBe(coordinatorForAdult?.id);
    const coordinator = coordinatorForElder!;

    const firstStatus = extractStatus(gatheringBehavior.execute(elder, context, elder.aiBlackboard!));
    expect(firstStatus).toBe(NodeStatus.RUNNING);

    const taskKey = `tribal_gather_${bush.id}`;
    const initialTask = Blackboard.get<TribalTaskData>(coordinator.aiBlackboard!, taskKey);
    expect(initialTask?.memberIds).toEqual([elder.id]);

    const secondStatus = extractStatus(gatheringBehavior.execute(adult, context, adult.aiBlackboard!));
    expect(secondStatus).toBe(NodeStatus.FAILURE);

    const updatedTask = Blackboard.get<TribalTaskData>(coordinator.aiBlackboard!, taskKey);
    expect(updatedTask?.memberIds).toEqual([elder.id]);
  });
});
