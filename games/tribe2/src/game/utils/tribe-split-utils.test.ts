import { describe, it, expect, beforeEach } from 'vitest';
import { canSplitTribe, performTribeSplit, findSafeTribeSplitLocation } from './tribe-split-utils';
import { createEntities, createHuman, giveBirth } from '../entities/entities-update';
import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState, UpdateContext } from '../world-types';
import { indexWorldState } from '../world-index/world-state-index';
import { generateTribeBadge } from './general-utils';
import {
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MOVE_AWAY_DISTANCE,
} from '../tribe-consts';

// Helper to create a minimal game state for testing
function createTestGameState(): GameWorldState {
  const entities = createEntities();

  const gameState: GameWorldState = {
    time: 0,
    entities: entities,
    mapDimensions: {
      width: 2000,
      height: 2000,
    },
    generationCount: 1,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    viewportCenter: { x: 1000, y: 1000 },
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
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
    tutorial: { steps: [], skipTutorial: true },
    tutorialState: { currentStepIndex: 0, isActive: false, hasStarted: false, isCompleted: true },
    debugPanel: 0,
    performanceMetrics: {
      currentBucket: { renderTime: 0, worldUpdateTime: 0, aiUpdateTime: 0 },
      history: [],
    },
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [],
    ecosystem: {
      preyGestationPeriod: 100,
      preyProcreationCooldown: 100,
      predatorGestationPeriod: 100,
      predatorProcreationCooldown: 100,
      preyHungerIncreasePerHour: 1,
      predatorHungerIncreasePerHour: 1,
      berryBushSpreadChance: 0.01,
    },
    lastAutosaveTime: 0,
  };

  return indexWorldState(gameState);
}

// Helper to find a human by ID
const findHumanById = (gameState: GameWorldState, id: number): HumanEntity | undefined => {
  return gameState.entities.entities[id] as HumanEntity | undefined;
};

describe('Tribe Split Utils', () => {
  let gameState: GameWorldState;
  let updateContext: UpdateContext;

  beforeEach(() => {
    gameState = createTestGameState();
    updateContext = { gameState, deltaTime: 1 };
  });

  describe('canSplitTribe', () => {
    it('should return false for a female human', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      const female = createHuman(gameState.entities, { x: 110, y: 100 }, 0, 'female', false, 25);
      female.leaderId = leader.id;
      female.tribeBadge = leader.tribeBadge;

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(female, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false for a child human', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      const child = createHuman(gameState.entities, { x: 110, y: 100 }, 0, 'male', false, 10); // age 10 = child
      child.leaderId = leader.id;
      child.tribeBadge = leader.tribeBadge;
      child.isAdult = false;

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(child, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false for a human who is already the leader', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(leader, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false for a human without a leaderId', () => {
      const loner = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      // No leaderId set

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(loner, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false if the human is the heir of the leader', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 40);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      const mother = createHuman(gameState.entities, { x: 110, y: 100 }, 0, 'female', false, 35);
      mother.leaderId = leader.id;
      mother.tribeBadge = leader.tribeBadge;

      // Create a son who is the heir
      const son = createHuman(
        gameState.entities,
        { x: 120, y: 100 },
        0,
        'male',
        false,
        25,
        0,
        mother.id,
        leader.id,
        [],
        leader.id,
        leader.tribeBadge,
      );
      son.isAdult = true;

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(son, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false if tribe is too small', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 40);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      // Create a potential splitter who is not the heir
      const splitter = createHuman(
        gameState.entities,
        { x: 200, y: 100 },
        0,
        'male',
        false,
        25,
        0,
        undefined,
        undefined,
        [],
        leader.id,
        leader.tribeBadge,
      );
      splitter.isAdult = true;

      // Only 2 tribe members - below minimum (TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 40)
      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(splitter, gameState);
      expect(result.canSplit).toBe(false);
    });

    it('should return false if family size is insufficient', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 40);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      // Create many tribe members to meet minimum tribe size
      for (let i = 0; i < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT; i++) {
        const member = createHuman(
          gameState.entities,
          { x: 100 + i * 10, y: 200 },
          0,
          i % 2 === 0 ? 'male' : 'female',
          false,
          25,
          0,
          undefined,
          undefined,
          [],
          leader.id,
          leader.tribeBadge,
        );
        member.isAdult = true;
      }

      // Create a potential splitter with no descendants
      const splitter = createHuman(
        gameState.entities,
        { x: 500, y: 100 },
        0,
        'male',
        false,
        25,
        0,
        undefined,
        undefined,
        [],
        leader.id,
        leader.tribeBadge,
      );
      splitter.isAdult = true;

      // Re-index
      gameState = indexWorldState(gameState);

      const result = canSplitTribe(splitter, gameState);
      // Family size is 1 (just the splitter himself), required is 30% of tribe = ~12
      expect(result.canSplit).toBe(false);
      expect(result.progress).toBeDefined();
      expect(result.progress!).toBeLessThan(1);
    });

    it('should return true when all conditions are met', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 50);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();

      // Create an heir (oldest son of leader) - using fatherId parameter correctly
      const heir = createHuman(
        gameState.entities,
        { x: 110, y: 100 },
        0,
        'male',
        false,
        30,        // age
        0,         // hunger
        undefined, // motherId
        leader.id, // fatherId - heir's father is the leader
        [],
        leader.id, // leaderId
        leader.tribeBadge,
      );
      // heir is automatically adult based on age >= 18

      // Create many other tribe members to meet minimum (they don't need to be leader's children)
      for (let i = 0; i < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT - 2; i++) {
        createHuman(
          gameState.entities,
          { x: 100 + i * 10, y: 200 },
          0,
          i % 2 === 0 ? 'male' : 'female',
          false,
          25,        // adult age
          0,
          undefined, // motherId
          undefined, // fatherId - unrelated to leader
          [],
          leader.id, // in the tribe
          leader.tribeBadge,
        );
      }

      // Create a potential splitter who is NOT the heir (not child of leader)
      const splitter = createHuman(
        gameState.entities,
        { x: 500, y: 100 },
        0,
        'male',
        false,
        35,        // adult age
        0,
        undefined, // motherId
        undefined, // fatherId - NOT a child of leader, so not the heir
        [],
        leader.id, // in the tribe
        leader.tribeBadge,
      );

      // Give the splitter enough descendants to meet the family size requirement
      // Family size = descendants + 1 (for the splitter himself)
      // requiredSize = min(tribeSize * 0.3, 40)
      // With 40 tribe members, requiredSize = min(40*0.3, 40) = 12
      // But we'll have more than 40 members, so we need to calculate properly
      
      // For safety, let's create enough children to exceed the requirement
      // We need familySize >= requiredSize
      // familySize = descendants + 1
      // requiredSize = min(tribeSize * 0.3, 40)
      // With current setup: tribeSize = 1 (leader) + 1 (heir) + 38 (members) + 1 (splitter) + children = 41 + children
      // If we have 40 children: tribeSize = 81, requiredSize = min(81*0.3, 40) = min(24.3, 40) = 24.3
      // familySize = 40 + 1 = 41 >= 24.3 ✓
      
      const numChildren = 40; // More than enough to meet requirements

      // Create (numChildren) children
      for (let i = 0; i < numChildren; i++) {
        createHuman(
          gameState.entities,
          { x: 510 + i * 10, y: 100 },
          0,
          i % 2 === 0 ? 'male' : 'female',
          false,
          20,          // adult age
          0,
          undefined,   // motherId
          splitter.id, // fatherId - splitter is the father
          [],
          leader.id,   // in the tribe
          leader.tribeBadge,
        );
      }

      // Re-index AFTER all entities are created with correct properties
      gameState = indexWorldState(gameState);

      // Debug: verify the setup is correct using the indexed state
      const indexedState = gameState as any;
      const tribeMembers = indexedState.search.human.byProperty('leaderId', leader.id);
      const splitterChildren = indexedState.search.human.byProperty('fatherId', splitter.id);
      const leaderChildren = indexedState.search.human.byProperty('fatherId', leader.id);
      
      // Verify tribe is large enough
      expect(tribeMembers.length).toBeGreaterThanOrEqual(TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT);
      // Verify splitter has children
      expect(splitterChildren.length).toBe(numChildren);
      // Verify leader has an heir (at least one child)
      expect(leaderChildren.length).toBeGreaterThanOrEqual(1);

      const result = canSplitTribe(splitter, gameState);
      
      // The family size = descendants + 1 = numChildren + 1 >= requiredSize
      expect(result.canSplit).toBe(true);
      expect(result.progress).toBeGreaterThanOrEqual(1);
    });
  });

  describe('performTribeSplit', () => {
    it('should not perform split if canSplitTribe returns false', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();
      const originalBadge = leader.tribeBadge;

      const female = createHuman(gameState.entities, { x: 110, y: 100 }, 0, 'female', false, 25);
      female.leaderId = leader.id;
      female.tribeBadge = leader.tribeBadge;

      // Re-index
      gameState = indexWorldState(gameState);

      performTribeSplit(female, gameState);

      // Should remain unchanged
      const updatedFemale = findHumanById(gameState, female.id)!;
      expect(updatedFemale.leaderId).toBe(leader.id);
      expect(updatedFemale.tribeBadge).toBe(originalBadge);
    });

    it('should create a new tribe when split is performed', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 50);
      leader.leaderId = leader.id;
      leader.tribeBadge = generateTribeBadge();
      leader.diplomacy = {}; // Initialize diplomacy so it can be updated
      const originalLeaderBadge = leader.tribeBadge;

      // Create an heir (child of leader)
      createHuman(
        gameState.entities,
        { x: 110, y: 100 },
        0,
        'male',
        false,
        30,        // adult age
        0,
        undefined, // motherId
        leader.id, // fatherId - heir's father is the leader
        [],
        leader.id,
        leader.tribeBadge,
      );

      // Create enough tribe members
      for (let i = 0; i < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT - 2; i++) {
        createHuman(
          gameState.entities,
          { x: 100 + i * 10, y: 200 },
          0,
          i % 2 === 0 ? 'male' : 'female',
          false,
          25,        // adult age
          0,
          undefined, // motherId
          undefined, // fatherId - unrelated
          [],
          leader.id,
          leader.tribeBadge,
        );
      }

      // Create a potential splitter with enough descendants
      const splitter = createHuman(
        gameState.entities,
        { x: 500, y: 100 },
        0,
        'male',
        false,
        35,        // adult age
        0,
        undefined, // motherId
        undefined, // fatherId - NOT a child of leader
        [],
        leader.id,
        leader.tribeBadge,
      );

      // Create 40 children to ensure family size exceeds the required threshold
      const numChildren = 40;

      const childIds: number[] = [];
      for (let i = 0; i < numChildren; i++) {
        const child = createHuman(
          gameState.entities,
          { x: 510 + i * 10, y: 100 },
          0,
          i % 2 === 0 ? 'male' : 'female',
          false,
          20,          // adult age
          0,
          undefined,   // motherId
          splitter.id, // fatherId - splitter is the father
          [],
          leader.id,
          leader.tribeBadge,
        );
        childIds.push(child.id);
      }

      // Re-index AFTER all entities are created
      gameState = indexWorldState(gameState);

      // Verify preconditions
      const indexedState = gameState as any;
      const splitterChildren = indexedState.search.human.byProperty('fatherId', splitter.id);
      expect(splitterChildren.length).toBe(numChildren);

      // Perform the split
      performTribeSplit(splitter, gameState);

      // Check splitter became the new leader
      const updatedSplitter = findHumanById(gameState, splitter.id)!;
      expect(updatedSplitter.leaderId).toBe(splitter.id);
      expect(updatedSplitter.tribeBadge).not.toBe(originalLeaderBadge);
      expect(updatedSplitter.diplomacy).toEqual({});

      // Check descendants follow the new leader
      for (const childId of childIds) {
        const child = findHumanById(gameState, childId)!;
        expect(child.leaderId).toBe(splitter.id);
        expect(child.tribeBadge).toBe(updatedSplitter.tribeBadge);
      }

      // Check old leader's diplomacy is updated
      const updatedLeader = findHumanById(gameState, leader.id)!;
      expect(updatedLeader.diplomacy).toBeDefined();
      expect(updatedLeader.diplomacy![splitter.id]).toBe('Hostile'); // DiplomacyStatus.Hostile = 'Hostile'
    });
  });

  describe('findSafeTribeSplitLocation', () => {
    it('should find a location far enough from the tribe center', () => {
      const leader = createHuman(gameState.entities, { x: 1000, y: 1000 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;

      // Re-index
      gameState = indexWorldState(gameState);

      const tribeCenter = { x: 1000, y: 1000 };
      const location = findSafeTribeSplitLocation(tribeCenter, leader, gameState);

      expect(location).not.toBeNull();
      if (location) {
        // Calculate distance (accounting for wrapping would be more complex, but basic check)
        const dx = Math.abs(location.x - tribeCenter.x);
        const dy = Math.abs(location.y - tribeCenter.y);
        const wrappedDx = Math.min(dx, gameState.mapDimensions.width - dx);
        const wrappedDy = Math.min(dy, gameState.mapDimensions.height - dy);
        const distance = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);
        expect(distance).toBeGreaterThanOrEqual(TRIBE_SPLIT_MOVE_AWAY_DISTANCE);
      }
    });

    it('should return null if the world is too crowded', () => {
      const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 30);
      leader.leaderId = leader.id;

      // Create a very small world state
      const smallGameState = createTestGameState();
      smallGameState.mapDimensions = { width: 200, height: 200 };

      // Fill it with entities
      for (let x = 0; x < 200; x += 20) {
        for (let y = 0; y < 200; y += 20) {
          createHuman(smallGameState.entities, { x, y }, 0, 'male', false, 30);
        }
      }

      // Re-index
      const indexedSmallState = indexWorldState(smallGameState);

      const tribeCenter = { x: 100, y: 100 };
      const location = findSafeTribeSplitLocation(tribeCenter, leader, indexedSmallState);

      // In a crowded small world, finding a safe location far enough away is difficult
      // The function should return null or a valid location without crashing
      // This test primarily verifies the function handles edge cases gracefully
      expect(location).toBeNull();
    });
  });
});

describe('Tribe Split Behavior Integration', () => {
  let gameState: GameWorldState;

  beforeEach(() => {
    gameState = createTestGameState();
  });

  it('should track progress towards split requirements', () => {
    const leader = createHuman(gameState.entities, { x: 100, y: 100 }, 0, 'male', false, 50);
    leader.leaderId = leader.id;
    leader.tribeBadge = generateTribeBadge();

    // Create an heir so our splitter isn't the heir
    const heir = createHuman(
      gameState.entities,
      { x: 110, y: 100 },
      0,
      'male',
      false,
      30,
      0,
      undefined,
      leader.id,
      [],
      leader.id,
      leader.tribeBadge,
    );

    // Create enough tribe members for minimum
    for (let i = 0; i < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT - 2; i++) {
      createHuman(
        gameState.entities,
        { x: 100 + i * 10, y: 200 },
        0,
        i % 2 === 0 ? 'male' : 'female',
        false,
        25,
        0,
        undefined,
        undefined,
        [],
        leader.id,
        leader.tribeBadge,
      );
    }

    // Create a splitter with some but not enough descendants
    const splitter = createHuman(
      gameState.entities,
      { x: 500, y: 100 },
      0,
      'male',
      false,
      35,
      0,
      undefined,
      undefined,
      [],
      leader.id,
      leader.tribeBadge,
    );
    splitter.isAdult = true;

    // Add just 2 children (not enough)
    for (let i = 0; i < 2; i++) {
      createHuman(
        gameState.entities,
        { x: 510 + i * 10, y: 100 },
        0,
        'male',
        false,
        20,
        0,
        undefined,
        splitter.id,
        [],
        leader.id,
        leader.tribeBadge,
      );
    }

    // Re-index
    gameState = indexWorldState(gameState);

    const result = canSplitTribe(splitter, gameState);
    expect(result.canSplit).toBe(false);
    expect(result.progress).toBeDefined();
    expect(result.progress!).toBeGreaterThan(0); // Some progress
    expect(result.progress!).toBeLessThan(1); // But not complete
  });
});
