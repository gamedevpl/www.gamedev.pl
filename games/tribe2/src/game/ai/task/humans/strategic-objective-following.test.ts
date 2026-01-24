import { describe, it, expect, beforeEach } from 'vitest';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { StrategicObjective } from '../../../entities/tribe/tribe-types';
import { getStrategyMultiplier } from './human-task-utils';
import { UpdateContext } from '../../../world-types';

describe('Strategic Objective Following', () => {
  let gameState: UpdateContext['gameState'];

  function createHumanWithLeader(
    humanId: number,
    leaderId: number,
  ): HumanEntity {
    return {
      id: humanId,
      type: 'human',
      position: { x: 100, y: 100 },
      leaderId,
    } as HumanEntity;
  }

  function createLeader(
    leaderId: number,
    strategicObjective?: StrategicObjective
  ): HumanEntity {
    return {
      id: leaderId,
      type: 'human',
      position: { x: 100, y: 100 },
      leaderId,
      tribeControl: {
        diplomacy: {},
        strategicObjective,
      },
    } as HumanEntity;
  }

  beforeEach(() => {
    gameState = {
      entities: { entities: {} },
    } as unknown as UpdateContext['gameState'];
  });

  describe('getStrategyMultiplier', () => {
    it('should return multiplier when leader has matching strategic objective', () => {
      const leader = createLeader(1, StrategicObjective.GreatHarvest);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;
      const result = getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      expect(result).toBe(2.5);
    });

    it('should return 1 when leader has different strategic objective', () => {
      const leader = createLeader(1, StrategicObjective.BabyBoom);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;
      const result = getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      expect(result).toBe(1);
    });

    it('should return 1 when human has no leader', () => {
      const loneHuman = {
        id: 2,
        type: 'human',
        position: { x: 100, y: 100 },
        leaderId: undefined,
      } as unknown as HumanEntity;
      gameState.entities.entities[2] = loneHuman;

      const context = { gameState } as UpdateContext;
      const result = getStrategyMultiplier(loneHuman, context, StrategicObjective.GreatHarvest, 2.5);

      expect(result).toBe(1);
    });

    it('should return 1 when leader entity does not exist', () => {
      const member = createHumanWithLeader(2, 999); // Non-existent leader
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;
      const result = getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      expect(result).toBe(1);
    });

    it('should return 1 when leader has no tribeControl', () => {
      const leader = {
        id: 1,
        type: 'human',
        leaderId: 1,
        tribeControl: undefined,
      } as unknown as HumanEntity;
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;
      const result = getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      expect(result).toBe(1);
    });
  });

  describe('Strategic Objective Task Scoring Effects', () => {
    /**
     * These tests verify that the correct tasks are boosted for each strategic objective.
     */

    it('should boost gathering tasks during GreatHarvest objective', () => {
      const leader = createLeader(1, StrategicObjective.GreatHarvest);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // GreatHarvest should boost gathering berries and meat (multiplier 2.5)
      expect(getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
      // But not affect other objectives
      expect(getStrategyMultiplier(member, context, StrategicObjective.LumberjackFever, 3.0)).toBe(1);
    });

    it('should boost planting tasks during GreenThumb objective', () => {
      const leader = createLeader(1, StrategicObjective.GreenThumb);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // GreenThumb should boost planting (multiplier 4.0)
      expect(getStrategyMultiplier(member, context, StrategicObjective.GreenThumb, 4.0)).toBe(4.0);
    });

    it('should boost wood-related tasks during LumberjackFever objective', () => {
      const leader = createLeader(1, StrategicObjective.LumberjackFever);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // LumberjackFever should boost chopping trees and gathering wood (multiplier 3.0)
      expect(getStrategyMultiplier(member, context, StrategicObjective.LumberjackFever, 3.0)).toBe(3.0);
    });

    it('should boost procreation and child care during BabyBoom objective', () => {
      const leader = createLeader(1, StrategicObjective.BabyBoom);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // BabyBoom should boost procreation and child feeding
      expect(getStrategyMultiplier(member, context, StrategicObjective.BabyBoom, 4.0)).toBe(4.0);
    });

    it('should boost defensive and attack tasks during ActiveDefense objective', () => {
      const leader = createLeader(1, StrategicObjective.ActiveDefense);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // ActiveDefense should boost attack and hunt predator tasks
      expect(getStrategyMultiplier(member, context, StrategicObjective.ActiveDefense, 2.5)).toBe(2.5);
    });

    it('should boost attack tasks during Warpath objective', () => {
      const leader = createLeader(1, StrategicObjective.Warpath);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // Warpath should heavily boost attack tasks
      expect(getStrategyMultiplier(member, context, StrategicObjective.Warpath, 5.0)).toBe(5.0);
    });

    it('should boost building tasks during ManifestDestiny objective', () => {
      const leader = createLeader(1, StrategicObjective.ManifestDestiny);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // ManifestDestiny should boost expansion/building tasks
      expect(getStrategyMultiplier(member, context, StrategicObjective.ManifestDestiny, 2.0)).toBe(2.0);
    });

    it('should boost fortification tasks during IronCurtain objective', () => {
      const leader = createLeader(1, StrategicObjective.IronCurtain);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // IronCurtain should boost palisade and gate building
      expect(getStrategyMultiplier(member, context, StrategicObjective.IronCurtain, 3.5)).toBe(3.5);
    });

    it('should boost stockpile and fuel tasks during WinterPrep objective', () => {
      const leader = createLeader(1, StrategicObjective.WinterPrep);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // WinterPrep should boost stockpiling and fueling bonfires
      expect(getStrategyMultiplier(member, context, StrategicObjective.WinterPrep, 2.0)).toBe(2.0);
    });
  });

  describe('All Strategic Objectives Coverage', () => {
    const allObjectives = Object.values(StrategicObjective);

    it('should handle all defined strategic objectives', () => {
      expect(allObjectives).toContain(StrategicObjective.None);
      expect(allObjectives).toContain(StrategicObjective.GreatHarvest);
      expect(allObjectives).toContain(StrategicObjective.GreenThumb);
      expect(allObjectives).toContain(StrategicObjective.LumberjackFever);
      expect(allObjectives).toContain(StrategicObjective.WinterPrep);
      expect(allObjectives).toContain(StrategicObjective.BabyBoom);
      expect(allObjectives).toContain(StrategicObjective.ManifestDestiny);
      expect(allObjectives).toContain(StrategicObjective.IronCurtain);
      expect(allObjectives).toContain(StrategicObjective.Warpath);
      expect(allObjectives).toContain(StrategicObjective.ActiveDefense);
      expect(allObjectives).toContain(StrategicObjective.RaidingParty);
    });

    it('should return multiplier 1 for None objective regardless of requested objective', () => {
      const leader = createLeader(1, StrategicObjective.None);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // None should never match any specific objective
      allObjectives
        .filter(obj => obj !== StrategicObjective.None)
        .forEach(objective => {
          expect(getStrategyMultiplier(member, context, objective, 2.0)).toBe(1);
        });
    });
  });
});
