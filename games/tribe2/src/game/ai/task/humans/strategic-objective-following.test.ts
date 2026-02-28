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

  describe('Human Task Selection Adherence', () => {
    /**
     * These tests verify that task scoring correctly influences which tasks humans select
     * when multiple options are available. The strategic objective should cause humans
     * to prefer tasks that align with their tribe's current goal.
     */

    it('should prefer gathering tasks when tribe has GreatHarvest objective', () => {
      const leader = createLeader(1, StrategicObjective.GreatHarvest);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // GreatHarvest multiplier = 2.5 for gathering
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);
      // LumberjackFever multiplier = 1 (not active)
      const woodScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.LumberjackFever, 3.0);

      // Gathering should win with GreatHarvest active
      expect(gatherScore).toBe(1.25); // 0.5 * 2.5
      expect(woodScore).toBe(0.5);    // 0.5 * 1
      expect(gatherScore).toBeGreaterThan(woodScore);
    });

    it('should prefer wood tasks when tribe has LumberjackFever objective', () => {
      const leader = createLeader(1, StrategicObjective.LumberjackFever);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // GreatHarvest multiplier = 1 (not active)
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);
      // LumberjackFever multiplier = 3.0 for wood tasks
      const woodScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.LumberjackFever, 3.0);

      // Wood should win with LumberjackFever active
      expect(gatherScore).toBe(0.5); // 0.5 * 1
      expect(woodScore).toBe(1.5);   // 0.5 * 3.0
      expect(woodScore).toBeGreaterThan(gatherScore);
    });

    it('should prefer procreation tasks when tribe has BabyBoom objective', () => {
      const leader = createLeader(1, StrategicObjective.BabyBoom);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // BabyBoom multiplier = 4.0 for procreation
      const procreateScore = 0.3 * getStrategyMultiplier(member, context, StrategicObjective.BabyBoom, 4.0);
      // Other objective = 1
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      // Procreation should win with BabyBoom active despite lower base score
      expect(procreateScore).toBe(1.2);  // 0.3 * 4.0
      expect(gatherScore).toBe(0.5);     // 0.5 * 1
      expect(procreateScore).toBeGreaterThan(gatherScore);
    });

    it('should prefer attack tasks when tribe has ActiveDefense objective', () => {
      const leader = createLeader(1, StrategicObjective.ActiveDefense);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // ActiveDefense multiplier = 2.5 for attack/defense
      const defenseScore = 0.4 * getStrategyMultiplier(member, context, StrategicObjective.ActiveDefense, 2.5);
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      // Defense should win with ActiveDefense active
      expect(defenseScore).toBe(1.0); // 0.4 * 2.5
      expect(gatherScore).toBe(0.5);  // 0.5 * 1
      expect(defenseScore).toBeGreaterThan(gatherScore);
    });

    it('should prefer planting tasks when tribe has GreenThumb objective', () => {
      const leader = createLeader(1, StrategicObjective.GreenThumb);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // GreenThumb multiplier = 4.0 for planting
      const plantScore = 0.25 * getStrategyMultiplier(member, context, StrategicObjective.GreenThumb, 4.0);
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      // Planting should win with GreenThumb active despite much lower base score
      expect(plantScore).toBe(1.0);   // 0.25 * 4.0
      expect(gatherScore).toBe(0.5);  // 0.5 * 1
      expect(plantScore).toBeGreaterThan(gatherScore);
    });

    it('should prefer fortification tasks when tribe has IronCurtain objective', () => {
      const leader = createLeader(1, StrategicObjective.IronCurtain);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // IronCurtain multiplier = 3.5 for fortification
      const fortifyScore = 0.3 * getStrategyMultiplier(member, context, StrategicObjective.IronCurtain, 3.5);
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      // Fortification should win with IronCurtain active
      expect(fortifyScore).toBe(1.05); // 0.3 * 3.5
      expect(gatherScore).toBe(0.5);   // 0.5 * 1
      expect(fortifyScore).toBeGreaterThan(gatherScore);
    });

    it('should prefer attack tasks when tribe has Warpath objective', () => {
      const leader = createLeader(1, StrategicObjective.Warpath);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // Warpath multiplier = 5.0 for attack
      const attackScore = 0.2 * getStrategyMultiplier(member, context, StrategicObjective.Warpath, 5.0);
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);

      // Attack should win with Warpath active despite much lower base score
      expect(attackScore).toBe(1.0);  // 0.2 * 5.0
      expect(gatherScore).toBe(0.5);  // 0.5 * 1
      expect(attackScore).toBeGreaterThan(gatherScore);
    });

    it('should have no preference boost when tribe has None objective', () => {
      const leader = createLeader(1, StrategicObjective.None);
      const member = createHumanWithLeader(2, 1);
      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member;

      const context = { gameState } as UpdateContext;

      // All multipliers should be 1 when objective is None
      const gatherScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreatHarvest, 2.5);
      const woodScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.LumberjackFever, 3.0);
      const plantScore = 0.5 * getStrategyMultiplier(member, context, StrategicObjective.GreenThumb, 4.0);

      // All should be equal base scores
      expect(gatherScore).toBe(0.5);
      expect(woodScore).toBe(0.5);
      expect(plantScore).toBe(0.5);
    });
  });

  describe('Tribe Member Objective Inheritance', () => {
    /**
     * These tests verify that tribe members correctly inherit their leader's
     * strategic objective when calculating task scores.
     */

    it('all tribe members should follow the same strategic objective', () => {
      const leader = createLeader(1, StrategicObjective.GreatHarvest);
      const member1 = createHumanWithLeader(2, 1);
      const member2 = createHumanWithLeader(3, 1);
      const member3 = createHumanWithLeader(4, 1);

      gameState.entities.entities[1] = leader;
      gameState.entities.entities[2] = member1;
      gameState.entities.entities[3] = member2;
      gameState.entities.entities[4] = member3;

      const context = { gameState } as UpdateContext;

      // All members should get the same multiplier from the leader
      expect(getStrategyMultiplier(member1, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
      expect(getStrategyMultiplier(member2, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
      expect(getStrategyMultiplier(member3, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
    });

    it('leader should also follow the strategic objective', () => {
      const leader = createLeader(1, StrategicObjective.GreatHarvest);
      gameState.entities.entities[1] = leader;

      const context = { gameState } as UpdateContext;

      // Leader (who is their own leader) should also get the boost
      expect(getStrategyMultiplier(leader, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
    });

    it('members of different tribes should follow their own leader\'s objective', () => {
      // Tribe 1 with GreatHarvest
      const leader1 = createLeader(1, StrategicObjective.GreatHarvest);
      const member1 = createHumanWithLeader(2, 1);

      // Tribe 2 with LumberjackFever
      const leader2 = createLeader(10, StrategicObjective.LumberjackFever);
      const member2 = createHumanWithLeader(11, 10);

      gameState.entities.entities[1] = leader1;
      gameState.entities.entities[2] = member1;
      gameState.entities.entities[10] = leader2;
      gameState.entities.entities[11] = member2;

      const context = { gameState } as UpdateContext;

      // Tribe 1 members should boost gathering
      expect(getStrategyMultiplier(member1, context, StrategicObjective.GreatHarvest, 2.5)).toBe(2.5);
      expect(getStrategyMultiplier(member1, context, StrategicObjective.LumberjackFever, 3.0)).toBe(1);

      // Tribe 2 members should boost wood
      expect(getStrategyMultiplier(member2, context, StrategicObjective.GreatHarvest, 2.5)).toBe(1);
      expect(getStrategyMultiplier(member2, context, StrategicObjective.LumberjackFever, 3.0)).toBe(3.0);
    });
  });
});
