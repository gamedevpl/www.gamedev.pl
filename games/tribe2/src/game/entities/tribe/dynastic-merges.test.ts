import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanEntity } from '../characters/human/human-types';
import { GameWorldState } from '../../world-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { checkAndExecuteTribeMerges } from './family-tribe-utils';
import * as territoryUtils from './territory-utils';

// Mock territory utils to track calls
vi.mock('./territory-utils', async () => {
  const actual = await vi.importActual('./territory-utils');
  return {
    ...actual,
    replaceOwnerInTerrainOwnership: vi.fn(),
  };
});

describe('Dynastic Tribe Merges', () => {
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
      ...human,
    } as HumanEntity;
    gameState.entities.entities[h.id] = h;
    return h;
  }

  it("should merge a tribe into a cousin's tribe when the leader is missing", () => {
    // Tribe B: Healthy tribe with Leader B
    const leaderB = addHuman({ id: 2, leaderId: 2, ancestorIds: [100] });

    // Tribe A: Orphaned tribe (Leader 1 is dead/missing)
    // Member A1 is a cousin of Leader B (shares ancestor 100)
    const memberA1 = addHuman({ id: 11, leaderId: 1, ancestorIds: [100] });

    checkAndExecuteTribeMerges(gameState);

    expect(memberA1.leaderId).toBe(leaderB.id);
    expect(territoryUtils.replaceOwnerInTerrainOwnership).toHaveBeenCalledWith(gameState, 1, 2);
  });

  it("should merge a tribe into an in-law's tribe (partner of blood relative)", () => {
    // Tribe B: Healthy tribe with Leader B and Member B1
    const leaderB = addHuman({ id: 2, leaderId: 2 });
    const memberB1 = addHuman({ id: 21, leaderId: 2 });

    // Tribe A: Orphaned tribe (Leader 1 is dead/missing)
    // Member A1 is partnered with Member B1
    const memberA1 = addHuman({ id: 11, leaderId: 1, partnerIds: [memberB1.id] });
    memberB1.partnerIds = [memberA1.id];

    checkAndExecuteTribeMerges(gameState);

    expect(memberA1.leaderId).toBe(leaderB.id);
  });

  it('should NOT dissolve the tribe if members exist, even if no relatives are found', () => {
    // Tribe B: Healthy tribe but unrelated
    addHuman({ id: 2, leaderId: 2, ancestorIds: [999] });

    // Tribe A: Orphaned tribe
    const memberA1 = addHuman({ id: 11, leaderId: 1, ancestorIds: [100] });

    checkAndExecuteTribeMerges(gameState);

    // Instead of dissolving, it should promote memberA1 to leader
    expect(memberA1.leaderId).toBe(11);
    expect(territoryUtils.replaceOwnerInTerrainOwnership).toHaveBeenCalledWith(gameState, 1, 11);
  });

  it('should prioritize closer relations (Immediate > Blood > In-law)', () => {
    // Tribe B: Leader B is a cousin (Blood, weight 2)
    addHuman({ id: 2, leaderId: 2, ancestorIds: [100] });

    // Tribe C: Leader C is a father (Immediate, weight 3)
    const leaderC = addHuman({ id: 3, leaderId: 3 });

    // Tribe A: Orphaned tribe
    const memberA1 = addHuman({ id: 11, leaderId: 1, ancestorIds: [100], fatherId: leaderC.id });

    checkAndExecuteTribeMerges(gameState);

    // Should pick Tribe C because father is a stronger connection than cousin
    expect(memberA1.leaderId).toBe(leaderC.id);
  });

  it('should promote the patriarch of the largest family internally if no direct heir is found', () => {
    // Tribe A: Orphaned tribe (Leader 1 is dead)
    // Family 1: size 2 (Patriarch 11)
    const p1 = addHuman({ id: 11, leaderId: 1 });
    addHuman({ id: 12, leaderId: 1, fatherId: 11 });

    // Family 2: size 3 (Patriarch 21)
    const p2 = addHuman({ id: 21, leaderId: 1 });
    addHuman({ id: 22, leaderId: 1, fatherId: 21 });
    addHuman({ id: 23, leaderId: 1, fatherId: 21 });

    checkAndExecuteTribeMerges(gameState);

    // p2 should be the new leader because their family is larger
    expect(p2.leaderId).toBe(21);
    expect(p1.leaderId).toBe(21);
    expect(territoryUtils.replaceOwnerInTerrainOwnership).toHaveBeenCalledWith(gameState, 1, 21);
  });

  it('should only dissolve the tribe if there are no members left', () => {
    // Setup territory for tribe 1
    gameState.terrainOwnership[0] = 1;

    // Case 1: Tribe has members -> No dissolution (succession happens)
    const memberA1 = addHuman({ id: 11, leaderId: 1 });
    checkAndExecuteTribeMerges(gameState);
    expect(memberA1.leaderId).toBe(11);
    expect(territoryUtils.replaceOwnerInTerrainOwnership).toHaveBeenCalledWith(gameState, 1, 11);

    vi.clearAllMocks();

    // Case 2: Tribe is empty -> Dissolution
    delete gameState.entities.entities[11]; // Member dies, tribe is now extinct

    checkAndExecuteTribeMerges(gameState);
    // Should dissolve (clear territory)
    expect(territoryUtils.replaceOwnerInTerrainOwnership).toHaveBeenCalledWith(gameState, 1, null);
  });
});
