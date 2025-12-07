# Behavior Tree Bugs and Findings

## Summary

This document tracks all bugs, issues, semantic problems, and logic issues from systematic testing of behavior tree behaviors in the tribe2 game.

**Testing Progress**: 7 behaviors fully tested, 1 bug fixed, 110 tests written, all passing.

**Focus**: Not just bugs, but also semantic correctness and logic problems.

---

## Bugs Found and Fixed

### ✅ Bug #1: animal-wander-behavior.ts - Incorrect falsy check for wanderStartTime [FIXED]

**Location**: `animal-wander-behavior.ts:25`

**Severity**: Medium

**Type**: Logic Error (falsy check)

**Description**:
The condition `!wanderStartTime` incorrectly treats `0` as a falsy value, causing the wander target to be regenerated even when it shouldn't be. Since `0` is a valid game time (start of game), this causes the behavior to always regenerate the target on every tick if the game starts at time 0.

**Original Code**:
```typescript
if (!wanderTarget || !wanderStartTime || currentTime - wanderStartTime > 2) {
```

**Problem**:
- When `wanderStartTime === 0`, `!wanderStartTime` evaluates to `true`
- This causes unnecessary regeneration of wander targets at game start

**Fix Applied**:
```typescript
if (!wanderTarget || wanderStartTime === undefined || currentTime - wanderStartTime > 2) {
```

**Test Evidence**:
- Test: "should reuse wander target within time window" - NOW PASSES
- Test: "should handle time exactly at 2 hour boundary" - NOW PASSES

**Impact**:
- Animals will now wander more stably from game start
- Prevents unnecessary calculations and direction changes
- Behavior now works as originally intended

**Commit**: 29f9c40

---

## Semantic and Logic Issues Found

### ⚠️ Issue #1: prey-graze-behavior.ts - Redundant distance check in action

**Location**: `prey-graze-behavior.ts:82-89`

**Severity**: Low (code quality)

**Type**: Semantic Issue - Redundant Logic

**Description**:
The action node recalculates distance and checks if within range, even though the condition node already verified the bush exists and set `needToMoveToTarget` flag appropriately. This creates duplicate logic.

**Current Code**:
```typescript
// In condition (lines 40-56):
if (distance <= PREY_INTERACTION_RANGE) {
  Blackboard.set(blackboard, 'grazingTarget', closestBush.id);
  return true;
} else {
  Blackboard.set(blackboard, 'grazingTarget', closestBush.id);
  Blackboard.set(blackboard, 'needToMoveToTarget', true);
  return true;
}

// In action (lines 82-89):
if (distance <= PREY_INTERACTION_RANGE) {
  // Within range, start grazing
  prey.activeAction = 'grazing';
  ...
} else if (needToMove || distance > PREY_INTERACTION_RANGE) {
  // Need to move closer
  prey.activeAction = 'moving';
  ...
}
```

**Analysis**:
- The condition already determines if target is within range
- The action recalculates the same distance
- The `needToMove` flag is set but the action still checks distance again
- This is semantically correct but inefficient

**Recommendation**:
Trust the condition's decision and simplify action logic:
```typescript
// Action should simply check the flag:
if (needToMove) {
  prey.activeAction = 'moving';
  ...
} else {
  prey.activeAction = 'grazing';
  ...
}
```

**Impact**: Minor - works correctly but less efficient than needed

---

### ⚠️ Issue #2: predator-hunt-behavior.ts - Inconsistent use of TimeoutNode

**Location**: `predator-hunt-behavior.ts:65-115`

**Severity**: Medium (behavioral)

**Type**: Semantic Issue - Timeout may cause premature abandonment

**Description**:
The hunt action is wrapped in a TimeoutNode with a 10-hour timeout. This means if the predator is chasing prey for more than 10 hours, it will abandon the hunt even if it's close to catching the prey.

**Current Code**:
```typescript
new TimeoutNode(
  new ActionNode(
    (predator, context: UpdateContext, blackboard) => {
      // Hunt logic
      return NodeStatus.RUNNING;
    },
    'Hunt or Approach Prey',
    depth + 2,
  ),
  10,
  'Hunt Timeout (10 hour)',
  depth + 1,
)
```

**Analysis**:
- Timeout is meant to prevent infinite pursuit
- However, 10 hours might be too short if prey is fast or evasive
- Predator might abandon hunt right before catching prey
- No consideration of distance to prey in timeout logic

**Potential Problems**:
1. **Wasted Energy**: Predator invests energy chasing, then gives up near success
2. **Gameplay Balance**: May make predators less effective than intended
3. **Semantic Mismatch**: Timeout is based on time, not on pursuit viability (distance, prey health, etc.)

**Better Approach**:
- Use distance-based abandonment (if prey gets too far, give up)
- Use success probability metric (if chase is futile, abandon earlier)
- Combine timeout with distance check

**Impact**: Moderate - affects predator hunting effectiveness

---

### ⚠️ Issue #3: gathering-behavior.ts - Potential race condition with CachingNode

**Location**: `gathering-behavior.ts:195-207`

**Severity**: Low (edge case)

**Type**: Logic Issue - Cache invalidation timing

**Description**:
The CachingNode caches the food source search result for `BT_GATHERING_SEARCH_COOLDOWN_HOURS`. If a food source is found, cached, then depleted by another entity, the behavior will continue trying to use the cached (now invalid) target until the cache expires.

**Current Code**:
```typescript
new CachingNode(
  findFoodSourceAction,
  BT_GATHERING_SEARCH_COOLDOWN_HOURS,
  'Cache Food Source Search',
  depth + 3,
),
moveAndGatherAction,
```

**Analysis**:
- Cache is time-based, not validity-based
- If food source is depleted, `moveAndGatherAction` will detect it and fail
- But the Sequence will try again, hit the cache, get same target, fail again
- This creates a loop where human repeatedly tries to gather from empty source

**Test Evidence**:
From `gathering-behavior.test.ts` - we test "should FAIL if food source disappears" but this only tests the action failing, not the cache being smart about it.

**Potential Problems**:
1. **Wasted Effort**: Entity keeps trying depleted source until cache expires
2. **Starvation Risk**: Entity doesn't look for new food when needed
3. **NPCs look "dumb"**: Players see NPCs repeatedly failing at same task

**Better Approach**:
- Invalidate cache on FAILURE from moveAndGatherAction
- Or use shorter cache duration
- Or check food availability before returning cached result

**Impact**: Moderate - affects gameplay realism and NPC intelligence perception

---

### ⚠️ Issue #4: Multiple behaviors - Inconsistent hunger threshold semantics

**Location**: Various behaviors

**Severity**: Low (consistency)

**Type**: Semantic Issue - Inconsistent comparison operators

**Description**:
Different behaviors use different comparison operators for hunger thresholds, which can lead to off-by-one semantic errors and inconsistency.

**Examples**:
- `gathering-behavior.ts:161`: `hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING` (exclusive)
- `prey-graze-behavior.ts:26`: `hunger <= 30` (inclusive)
- `predator-hunt-behavior.ts:26`: `hunger <= 50` (inclusive)

**Analysis**:
When threshold is 50:
- `hunger > 50` means 51+ will trigger (50 won't)
- `hunger >= 50` means 50+ will trigger
- `hunger <= 50` means 0-50 won't trigger (51+ will)

**Potential Problems**:
1. **Confusion**: Different semantics make code harder to reason about
2. **Edge Cases**: Entities at exact threshold may behave unexpectedly
3. **Tuning Difficulty**: Designers need to remember which operator is used where

**Recommendation**:
Standardize on one approach:
- Either: `hunger > THRESHOLD` for "trigger when hungry" (consistent with gathering)
- Or: `hunger >= THRESHOLD` with clear documentation
- Document the semantics in constant definitions

**Impact**: Low - works correctly but semantically inconsistent

---

### ⚠️ Issue #5: prey-graze-behavior.ts - Missing blackboard cleanup on failure

**Location**: `prey-graze-behavior.ts:59-100`

**Severity**: Low (memory leak)

**Type**: Logic Issue - Blackboard state management

**Description**:
When the action fails (target is null or invalid), the blackboard keys `grazingTarget` and `needToMoveToTarget` are not explicitly cleared, potentially leaving stale data.

**Current Code**:
```typescript
const targetId = Blackboard.get<EntityId>(blackboard, 'grazingTarget');
const target = targetId && (context.gameState.entities.entities[targetId] as BerryBushEntity | undefined);

if (!target) {
  return NodeStatus.FAILURE; // Keys not cleared!
}
```

**Analysis**:
- Sequence node will fail and may re-run
- Stale blackboard data might cause issues on next execution
- However, condition node sets these keys on every success, which overwrites stale data
- Still, explicit cleanup is better practice

**Recommendation**:
```typescript
if (!target) {
  Blackboard.delete(blackboard, 'grazingTarget');
  Blackboard.delete(blackboard, 'needToMoveToTarget');
  return NodeStatus.FAILURE;
}
```

**Impact**: Very Low - unlikely to cause issues but violates cleanup principle

---

### ✅ Good Pattern #1: predator-hunt-behavior.ts - Proper dead entity check

**Location**: `predator-hunt-behavior.ts:72`

**Type**: Positive Finding

**Description**:
The behavior correctly checks `target.hitpoints <= 0` before attacking, preventing pursuit of dead prey.

**Code**:
```typescript
if (!target || target.hitpoints <= 0) {
  return NodeStatus.FAILURE;
}
```

**Impact**: This is semantically correct and prevents wasteful pursuit.

---

### ✅ Good Pattern #2: prey-flee-behavior.ts - Normalized direction vectors

**Location**: `prey-flee-behavior.ts:105`

**Type**: Positive Finding

**Description**:
Flee direction is properly normalized, ensuring consistent flee speed regardless of threat position.

**Code**:
```typescript
const normalizedFleeDirection = vectorNormalize(fleeDirection);
```

**Impact**: Ensures consistent and predictable behavior.

---

## Testing Infrastructure Challenges

### ✅ Challenge #1: Search Index Dependency - RESOLVED

**Resolution**: Created comprehensive `search-index-mock.ts` with full IndexType implementation

**Impact**: Unblocked testing of ~30 behaviors requiring spatial queries

---

### ⚠️ Challenge #2: Circular Import in fleeing-behavior - STILL PRESENT

**Severity**: High (blocks testing)

**Description**:
When attempting to import `fleeing-behavior.ts`, a circular dependency error occurs.

**Status**: Not yet investigated in detail

**Impact**:
- Cannot unit test fleeing behavior
- Suggests potential architectural issue in module structure
- May affect runtime performance or reliability

**Next Steps**: Investigate import chain and break circular dependency

---

## Recommendations Summary

### High Priority
1. **Investigate circular import** in fleeing-behavior.ts
2. **Review timeout logic** in predator-hunt-behavior.ts for balance

### Medium Priority
3. **Implement cache invalidation** on failure in gathering-behavior.ts
4. **Standardize hunger threshold semantics** across all behaviors

### Low Priority
5. **Add blackboard cleanup** on failure paths
6. **Remove redundant distance checks** where condition already checked

### Good Practices to Continue
- Testing exact threshold values (edge cases)
- Checking for dead entities before interacting
- Normalizing direction vectors
- Using explicit undefined checks instead of falsy checks

---

## Statistics

- **Behaviors Tested**: 7 / ~41 (17%)
- **Tests Written**: 110
- **Tests Passing**: 110 (100%)
- **Bugs Found**: 1 (fixed)
- **Semantic Issues Found**: 5 (documented)
- **Good Patterns Identified**: 2
- **Blockers**: 1 (circular import)

**Investigation Needed**:
- Map out the import dependency chain
- Identify circular dependencies
- Refactor to break circular dependencies if needed

---

## Successfully Tested Behaviors

### ✅ idle-wander-behavior.ts
- **Status**: PASSED (7/7 tests)
- **Complexity**: Low
- **Issues**: None found
- **Coverage**: Basic functionality, edge cases
- **Notes**: Simple fallback behavior, works perfectly

### ✅ eating-behavior.ts
- **Status**: PASSED (18/18 tests)
- **Complexity**: Medium
- **Issues**: None found
- **Coverage**: 
  - Condition checks (hunger, food availability, cooldown)
  - Action execution (setting state, clearing movement)
  - Edge cases (threshold values, state transitions)
  - Semantic correctness (comparison operators)
- **Notes**: Well-implemented behavior with proper condition checks

### ✅ animal-wander-behavior.ts
- **Status**: PASSED (17/17 tests) after bug fix
- **Complexity**: Medium
- **Issues**: 1 bug found and fixed (wanderStartTime check)
- **Coverage**:
  - Target generation and reuse
  - World wrapping (position and direction)
  - Time-based target expiration
  - Edge cases (boundaries, exact thresholds)
- **Notes**: Now works correctly with proper undefined checks

---

## Behaviors Blocked from Testing

Due to search index dependency:
- ❌ prey-graze-behavior.ts
- ❌ gathering-behavior.ts
- ❌ seeking-food-from-parent-behavior.ts
- ❌ And ~30+ more behaviors that use `findClosestEntity()` or similar

Due to circular imports:
- ❌ fleeing-behavior.ts

---

## Testing Infrastructure Improvements Made

### Improvement #1: Comprehensive Test Utilities

**File**: `behavior-test-utils.ts`

**Features**:
- `createMockHuman()` - Creates test human entities with sensible defaults
- `createMockPrey()` - Creates test prey entities
- `createMockPredator()` - Creates test predator entities
- `createMockContext()` - Creates test update contexts
- `createMockFoodItem()` - Creates test food items
- `addEntityToContext()` - Helper to add entities to game state
- `advanceTime()` - Helper to advance game time
- `createPositionAt()` - Helper for positioning entities
- Helper functions for executing and asserting behavior sequences

**Key Learning**:
Behaviors use the blackboard parameter for behavior-specific data, but use `entity.aiBlackboard` for node-specific state. Tests must use `entity.aiBlackboard!` as the blackboard parameter.

---

## Recommendations for Continued Testing

### Short Term (Immediate Actions)

1. **Create Search Index Mock**
   - Implement `createMockIndexedContext()` with functional search indexes
   - Or create a lightweight mock that satisfies the interface
   - This will unblock testing of ~30+ behaviors

2. **Resolve Circular Import**
   - Use a dependency visualization tool
   - Identify and break the circular dependency
   - This will unblock testing fleeing and related behaviors

3. **Test Simple Behaviors First**
   - Focus on behaviors without external dependencies
   - Build up a comprehensive bug list
   - Examples: simple condition/action sequences

### Medium Term (Strategic Improvements)

1. **Behavior Testing Framework**
   - Create behavior-specific test harnesses
   - Mock complex dependencies at behavior level
   - Add integration test helpers

2. **Refactor for Testability**
   - Consider dependency injection for finder functions
   - Separate core logic from framework dependencies
   - Make behaviors more unit-testable

3. **Integration Testing**
   - Test behavior trees with real game state
   - Run full simulations to catch integration bugs
   - Validate tree composition and priority

### Long Term (Architecture)

1. **Behavior Composition**
   - Review behavior tree structure
   - Ensure proper separation of concerns
   - Document behavior patterns and conventions

2. **Performance**
   - Profile behavior execution
   - Optimize hot paths
   - Consider caching strategies

---

## Statistics

- **Behaviors Tested**: 3 (idle-wander, eating, animal-wander)
- **Tests Written**: 42
- **Tests Passing**: 42 (100%)
- **Bugs Found**: 1
- **Bugs Fixed**: 1
- **Blockers**: 2 (search index dependency, circular import)
- **Coverage**: ~7% of total behaviors (3 out of ~40)

---

## Next Steps

1. ✅ Fix wanderStartTime bug - COMPLETED
2. ⏭️ Create search index mock infrastructure
3. ⏭️ Resolve circular import issues
4. ⏭️ Test remaining simple behaviors
5. ⏭️ Document all findings
6. ⏭️ Create comprehensive bug report
7. ⏭️ Propose architectural improvements

