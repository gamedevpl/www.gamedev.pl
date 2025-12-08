# Tribe Split Mechanics - Analysis and Findings

## Overview

This document summarizes the analysis of the tribe2 game's tribe split mechanics, including how tribe leaders are placed and how tribe splits work.

## Key Findings

### 1. Tribe Split Conditions (`canSplitTribe`)

A tribe member can split from their tribe and form a new tribe when ALL of these conditions are met:

1. **Human must be an adult male** - Only adult males can initiate a tribe split
2. **Not already a leader** - Must not be their own tribe's leader (`leaderId !== id`)
3. **Must have a leaderId** - Must be part of an existing tribe
4. **Not the heir** - Must not be the leader's heir (oldest male child of the leader)
5. **Tribe size requirement** - Original tribe must have at least `TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT` (40) members
6. **Family size requirement** - The splitter's family (themselves + descendants) must be >= `min(tribeSize * 0.3, 40)`

### 2. Sequence Node Re-evaluation Issue (Potential Bug)

**Problem**: The tribe split behavior uses a `Sequence` node with three steps:
1. ConditionNode: Check if split is possible (`canSplitTribe`)
2. ActionNode: Move to new territory (returns `RUNNING` while moving)
3. ActionNode: Perform the split

The `Sequence` composite node re-evaluates ALL children from the beginning on each tick, even when a later child is in `RUNNING` state.

**Impact**: If conditions change while the human is migrating to their new territory:
- A family member dies (reducing family size below threshold)
- The human becomes the heir (if older brothers die)
- Tribe size decreases below threshold

...the `canSplitTribe` check will fail and the entire split process will abort mid-migration.

**Example Scenario**:
1. Human A meets all conditions for tribe split (progress: 1.0+)
2. Tribe split behavior starts, finds a migration target 500+ units away
3. Human A starts moving to the new territory (ActionNode returns `RUNNING`)
4. While moving, one of Human A's descendants dies
5. On next AI tick, the Sequence re-evaluates:
   - Step 1 (`canSplitTribe`): Now returns `false` because family size is insufficient
   - Sequence returns `FAILURE`, aborting the migration
6. The migration target is cleared from the blackboard
7. On the next check (after cooldown), the process restarts from the beginning

### 3. performTribeSplit Implementation

When a split is performed:
1. The splitter becomes their own leader (`leaderId = id`)
2. A new tribe badge is generated
3. The splitter's diplomacy is cleared (new tribe has no relationships)
4. The old leader's diplomacy is updated to mark the new tribe as `Hostile`
5. All descendants of the splitter are transferred to the new tribe

**Note**: The old leader's diplomacy is only updated if `previousLeader.diplomacy` is already defined. If it's undefined, no hostile relationship is recorded.

### 4. Leader Building Placement

The leader building placement behavior:
- Only runs for tribe leaders (`leaderId === id`)
- Requires minimum `LEADER_BUILDING_MIN_TRIBE_SIZE` adult members
- Uses spiral search from tribe center to find valid building locations
- Prioritizes first storage spot establishment (bootstrap)
- Considers storage utilization and bush density for decisions

## Test Coverage

The following scenarios are now covered by unit tests in `tribe-split-utils.test.ts`:

### canSplitTribe Tests
- ✅ Female cannot split (returns false)
- ✅ Child cannot split (returns false)
- ✅ Leader cannot split from own tribe (returns false)
- ✅ Human without leaderId cannot split (returns false)
- ✅ Heir cannot split (returns false)
- ✅ Small tribe prevents split (returns false)
- ✅ Insufficient family size prevents split (returns false with progress < 1)
- ✅ All conditions met allows split (returns true with progress >= 1)

### performTribeSplit Tests
- ✅ Does nothing when conditions not met
- ✅ Creates new tribe when conditions met
- ✅ Updates all descendants to new tribe
- ✅ Sets old leader's diplomacy to Hostile (when diplomacy exists)

### findSafeTribeSplitLocation Tests
- ✅ Finds location far enough from tribe center
- ✅ Returns null when world is too crowded

## Recommendations

1. **Consider adding a "locked in" state for tribe split migration**: Once migration begins, the split should complete even if conditions change slightly. This could be done by:
   - Storing a "migration in progress" flag
   - Skipping the condition re-check when migration is underway
   - Only aborting if critical conditions fail (e.g., human dies)

2. **Initialize leader diplomacy when they become leaders**: Currently, if a leader has no diplomacy object, the hostile relationship isn't recorded during splits.

3. **Add progress tracking for partial requirements**: The `progress` field is useful for showing players how close they are to being able to split.

## Related Files

- `src/game/utils/tribe-split-utils.ts` - Core split logic
- `src/game/ai/behavior-tree/behaviors/tribe-split-behavior.ts` - Behavior tree implementation
- `src/game/ai/behavior-tree/nodes/composite-nodes.ts` - Sequence node implementation
- `src/game/tribe-consts.ts` - Split thresholds and constants
