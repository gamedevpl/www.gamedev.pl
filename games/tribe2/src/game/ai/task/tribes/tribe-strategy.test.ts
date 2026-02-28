import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { updateTribeStrategy } from './tribe-strategy';
import { StrategicObjective, TribeControl } from '../../../entities/tribe/tribe-types';
import { Blackboard } from '../../behavior-tree/behavior-tree-blackboard';

// Mock dependencies
vi.mock('../../../entities/tribe/tribe-food-utils', () => ({
  calculateTribeFoodSecurity: vi.fn(),
  getTribeWoodNeed: vi.fn(),
  getProductiveBushes: vi.fn(),
}));

vi.mock('../../../utils/ai-world-analysis-utils', () => ({
  findNearbyEnemiesOfTribe: vi.fn(),
}));

vi.mock('../../../entities/tribe/family-tribe-utils', () => ({
  getTribeMembers: vi.fn(),
}));

import { calculateTribeFoodSecurity, getTribeWoodNeed, getProductiveBushes } from '../../../entities/tribe/tribe-food-utils';
import { findNearbyEnemiesOfTribe } from '../../../utils/ai-world-analysis-utils';
import { getTribeMembers } from '../../../entities/tribe/family-tribe-utils';

describe('Tribe Strategy Selection', () => {
  let gameState: IndexedWorldState;
  let leader: HumanEntity;

  function createLeader(tribeControl?: Partial<TribeControl>): HumanEntity {
    const blackboardData = Blackboard.create();
    return {
      id: 1,
      type: 'human',
      position: { x: 100, y: 100 },
      isPlayer: false,
      leaderId: 1,
      tribeControl: {
        diplomacy: {},
        ...tribeControl,
      },
      aiBlackboard: blackboardData,
    } as HumanEntity;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    gameState = {
      time: 100,
      entities: { entities: {} },
    } as unknown as IndexedWorldState;
    leader = createLeader();
  });

  describe('Priority-based objective selection', () => {
    it('should select ActiveDefense when enemies are nearby', () => {
      // Setup: enemies present, other conditions irrelevant
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([
        { id: 2 } as HumanEntity,
      ]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.8);
      vi.mocked(getTribeWoodNeed).mockReturnValue(0);
      vi.mocked(getTribeMembers).mockReturnValue([
        { isAdult: true } as HumanEntity,
        { isAdult: true } as HumanEntity,
      ]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.ActiveDefense);
    });

    it('should select GreatHarvest when food security is critically low', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.4); // Below 0.5 threshold (FOOD_SECURITY_CRITICAL)
      vi.mocked(getTribeWoodNeed).mockReturnValue(0);
      vi.mocked(getTribeMembers).mockReturnValue([
        { isAdult: true } as HumanEntity,
      ]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.GreatHarvest);
    });

    it('should select LumberjackFever when wood need is high', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.6); // Above 0.5 threshold
      vi.mocked(getTribeWoodNeed).mockReturnValue(20); // High wood need > adultCount * 2
      vi.mocked(getTribeMembers).mockReturnValue([
        { isAdult: true } as HumanEntity,
        { isAdult: true } as HumanEntity,
      ]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.LumberjackFever);
    });

    it('should select GreenThumb when bush ratio is low and food is adequate', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.55); // Above 0.5 (FOOD_SECURITY_CRITICAL)
      vi.mocked(getTribeWoodNeed).mockReturnValue(2);
      vi.mocked(getTribeMembers).mockReturnValue([
        { isAdult: true } as HumanEntity,
        { isAdult: true } as HumanEntity,
      ]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 2, ratio: 1 }); // Below 2 ratio

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.GreenThumb);
    });

    it('should select BabyBoom when tribe is small and food is secure', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.7); // Above 0.6 (FOOD_SECURITY_STABLE)
      vi.mocked(getTribeWoodNeed).mockReturnValue(2);
      vi.mocked(getTribeMembers).mockReturnValue([
        { isAdult: true } as HumanEntity,
        { isAdult: true } as HumanEntity,
        { isAdult: true } as HumanEntity,
      ]); // Less than 10 adults
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 3 });

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.BabyBoom);
    });

    it('should select ManifestDestiny or IronCurtain when tribe is stable', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.75); // Above 0.7
      vi.mocked(getTribeWoodNeed).mockReturnValue(3); // Below 5
      vi.mocked(getTribeMembers).mockReturnValue(
        Array(15).fill({ isAdult: true } as HumanEntity) // More than 10 adults
      );
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 20, ratio: 3 });

      updateTribeStrategy(leader, gameState);

      expect([StrategicObjective.ManifestDestiny, StrategicObjective.IronCurtain]).toContain(
        leader.tribeControl?.strategicObjective
      );
    });
  });

  describe('Strategy change cooldown', () => {
    it('should not change strategy if cooldown has not passed', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([{ id: 2 } as HumanEntity]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.8);
      vi.mocked(getTribeWoodNeed).mockReturnValue(0);
      vi.mocked(getTribeMembers).mockReturnValue([{ isAdult: true } as HumanEntity]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      // Set last strategy change time to recent
      leader.aiBlackboard.data['lastStrategyChangeTime'] = gameState.time - 5; // 5 hours ago
      leader.tribeControl!.strategicObjective = StrategicObjective.GreenThumb;

      updateTribeStrategy(leader, gameState);

      // Should still be GreenThumb because cooldown hasn't passed
      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.GreenThumb);
    });

    it('should allow strategy change after cooldown passes', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([{ id: 2 } as HumanEntity]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.8);
      vi.mocked(getTribeWoodNeed).mockReturnValue(0);
      vi.mocked(getTribeMembers).mockReturnValue([{ isAdult: true } as HumanEntity]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      // Set last strategy change time to long ago
      leader.aiBlackboard.data['lastStrategyChangeTime'] = gameState.time - 15; // 15 hours ago (> 12 cooldown)
      leader.tribeControl!.strategicObjective = StrategicObjective.GreenThumb;

      updateTribeStrategy(leader, gameState);

      // Should switch to ActiveDefense because enemies are nearby
      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.ActiveDefense);
    });
  });

  describe('Edge cases', () => {
    it('should not update strategy for player-controlled tribes', () => {
      leader.isPlayer = true;
      leader.tribeControl!.strategicObjective = StrategicObjective.GreenThumb;

      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([{ id: 2 } as HumanEntity]);

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl?.strategicObjective).toBe(StrategicObjective.GreenThumb);
    });

    it('should not update strategy if tribeControl is missing', () => {
      leader.tribeControl = undefined;

      updateTribeStrategy(leader, gameState);

      expect(leader.tribeControl).toBeUndefined();
    });

    it('should record last strategy change time when strategy changes', () => {
      vi.mocked(findNearbyEnemiesOfTribe).mockReturnValue([{ id: 2 } as HumanEntity]);
      vi.mocked(calculateTribeFoodSecurity).mockReturnValue(0.8);
      vi.mocked(getTribeWoodNeed).mockReturnValue(0);
      vi.mocked(getTribeMembers).mockReturnValue([{ isAdult: true } as HumanEntity]);
      vi.mocked(getProductiveBushes).mockReturnValue({ count: 10, ratio: 5 });

      leader.tribeControl!.strategicObjective = StrategicObjective.None;

      updateTribeStrategy(leader, gameState);

      expect(leader.aiBlackboard.data['lastStrategyChangeTime']).toBe(gameState.time);
    });
  });
});
