# Behavior Tree Bugs and Findings

## Summary

This document tracks all bugs, issues, and findings from systematic testing of behavior tree behaviors in the tribe2 game.

**Testing Progress**: 3 behaviors fully tested, 1 bug found and fixed, 42 tests written, all passing.

---

## Bugs Found and Fixed

### ✅ Bug #1: animal-wander-behavior.ts - Incorrect falsy check for wanderStartTime [FIXED]

**Location**: `animal-wander-behavior.ts:25`

**Severity**: Medium

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

## Testing Infrastructure Challenges

### Challenge #1: Search Index Dependency

**Severity**: High (blocks testing many behaviors)

**Description**:
Many behaviors use `findClosestEntity()` which requires `context.gameState.search` to be a fully initialized search index with methods like `byRadius()`, `all()`, etc. This is an `IndexedWorldState` with complex spatial indexing structures.

**Affected Behaviors**:
- All gathering/hunting behaviors
- Fleeing behaviors  
- Social behaviors (find nearby tribe members)
- Procreation behaviors (find mates)
- And many more...

**Current Blocker**:
Creating proper mock contexts with search indexes requires:
1. Understanding the IndexedWorldState structure
2. Implementing or mocking spatial indexing
3. Properly initializing search indexes for all entity types
4. Maintaining index consistency with entity additions

**Attempted Workaround**:
Created test for `prey-graze-behavior.ts` but it failed due to missing `search.berryBush` index.

**Recommendation**:
Either:
1. Create a comprehensive `createMockIndexedContext()` helper that properly sets up search indexes
2. Refactor behaviors to accept injected finder functions (dependency injection)
3. Test only the simpler behaviors that don't use spatial queries
4. Focus on integration testing with real game state

---

### Challenge #2: Circular Import in fleeing-behavior

**Severity**: High (blocks testing)

**Description**:
When attempting to import `fleeing-behavior.ts`, a circular dependency error occurs:
```
ReferenceError: Cannot access '__vite_ssr_import_4__' before initialization
```

**Root Cause**: Not yet determined

**Impact**:
- Cannot unit test fleeing behavior
- Suggests potential architectural issue in module structure
- May affect runtime performance or reliability

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

