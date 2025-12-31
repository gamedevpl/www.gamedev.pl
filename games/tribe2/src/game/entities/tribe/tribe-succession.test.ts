import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanEntity } from '../characters/human/human-types';
import { GameWorldState } from '../../world-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { checkAndExecuteTribeMerges, getTribesInfo } from './family-tribe-utils';
import { Blackboard } from '../../ai/behavior-tree/behavior-tree-blackboard';

// Mock territory utils
vi.mock('./territory-utils', async () => {
  const actual = await vi.importActual('./territory-utils');
  return {
    ...actual,
    replaceOwnerInTerrainOwnership: vi.fn(),
  };
});

describe('Tribe Succession', () => {
  let gameState: GameWorldState;
  let indexedState: IndexedWorldState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup basic mock state
    gameState = {
      entities: {
        entities: {},
        nextEntityId: 1,
      },
      terrainOwnership: new Array(100).fill(null),
      mapDimensions: { width: 1000, height: 1000 },
      notifications: [],
      time: 0,
    } as unknown as GameWorldState;

    // Setup basic indexing mock
    indexedState = gameState as unknown as IndexedWorldState;
    indexedState.search = {
      human: {
        all: () => Object.values(gameState.entities.entities).filter((e) => e.type === 'human') as HumanEntity[],
        byProperty: (prop: string, value: unknown) =>
          Object.values(gameState.entities.entities).filter(
            (e) => e.type === 'human' && (e as Record<string, unknown>)[prop] === value,
          ) as HumanEntity[],
      },
      building: {
        byProperty: () => [],
      },
    } as unknown as IndexedWorldState['search'];
  });

  function addHuman(human: Partial<HumanEntity>): HumanEntity {
    const h = {
      type: 'human',
      ancestorIds: [],
      partnerIds: [],
      food: [],
      isAdult: true,
      hitpoints: 100,
      maxHitpoints: 100,
      gender: 'male',
      stateMachine: [
        '',
        {
          enteredAt: 0,
        },
      ],
      aiBlackboard: Blackboard.create(),
      ...human,
    } as HumanEntity;
    gameState.entities.entities[h.id] = h;
    return h;
  }

  it('should successfully promote an internal successor when the leader dies', () => {
    // Tribe A: Leader A (ID: 1) and Member A1 (ID: 11)
    // Note: Leader A is NOT in the entities (simulating death)
    const memberA1 = addHuman({ id: 11, leaderId: 1, tribeInfo: { tribeBadge: 'A', tribeColor: 'red' } });

    // Verify that before maintenance, memberA1 points to dead leader 1
    expect(gameState.entities.entities[1]).toBeUndefined();
    expect(memberA1.leaderId).toBe(1);

    // Run maintenance
    checkAndExecuteTribeMerges(gameState);

    // The bug: executeTribeMerge follows leaderId(1) -> leaderId(1) and fails or loops.
    // The expected behavior: memberA1 is promoted to leader of Tribe A.
    expect(memberA1.id).toBe(11);
    expect(memberA1.leaderId).toBe(11);
    expect(memberA1.tribeInfo?.tribeBadge).toBe('A');
  });

  it('getTribesInfo should not include tribes with dead leaders', () => {
    // Tribe A: Leader A (ID: 1) is dead, Member A1 (ID: 11) exists
    addHuman({ id: 11, leaderId: 1 });

    // Tribe B: Leader B (ID: 2) is alive
    addHuman({ id: 2, leaderId: 2 });

    const tribes = getTribesInfo(gameState);

    // If the bug exists, tribes will contain 2 entries (one for leader 1 and one for leader 2)
    // even though leader 1 is dead.
    // Expected: Only Tribe B should be listed.
    expect(tribes.length).toBe(1);
    expect(tribes[0].leaderId).toBe(2);
  });
});
