# Behavior Tree Testing - Findings and Bugs

## Summary
This document summarizes the findings from systematic testing of the behavior tree framework and individual behaviors in `games/tribe2/src/game/ai/behavior-tree/`.

## Critical Bugs Found

### 1. CooldownNode sets cooldown on RUNNING status (CRITICAL)

**Location:** `games/tribe2/src/game/ai/behavior-tree/nodes/decorator-nodes.ts:390`

**Issue:**
The CooldownNode sets the cooldown when a child returns RUNNING for the first time. If the child later fails (after being RUNNING), the cooldown remains active, preventing the behavior from being retried.

**Current Code:**
```typescript
if (childStatus === NodeStatus.SUCCESS || childStatus === NodeStatus.RUNNING) {
  Blackboard.set(blackboard, this.cooldownKey, currentTime + this.cooldownDurationHours);
}
```

**Problem:**
1. Child starts and returns RUNNING → cooldown is set immediately
2. Child continues and returns FAILURE → cooldown is still active
3. Behavior cannot retry even though it failed
4. This affects behaviors like gathering, planting, procreation, etc.

**Recommended Fix:**
Only set cooldown on SUCCESS:
```typescript
if (childStatus === NodeStatus.SUCCESS) {
  Blackboard.set(blackboard, this.cooldownKey, currentTime + this.cooldownDurationHours);
}
```

**Alternative Fix (if cooldown on failure is desired):**
```typescript
if (childStatus === NodeStatus.FAILURE) {
  Blackboard.set(blackboard, this.cooldownKey, currentTime + this.cooldownDurationHours);
}
```

**Impact:**
- HIGH: Affects multiple behaviors that use CooldownNode
- Behaviors: gathering, planting, procreation, territory establishment, etc.
- Could cause AI to get "stuck" unable to retry important actions

**Test Case:**
See `behavior-tree/behaviors/cooldown-bug-analysis.ts` for reproduction

---

## Potential Issues / Code Smells

### 2. Blackboard key cleanup inconsistency

**Issue:**
Some behaviors set keys in the blackboard but don't consistently clean them up on all failure/interruption paths.

**Examples:**
- `fleeing-behavior.ts`: Sets 'fleeThreat' but never explicitly deletes it
- `animal-wander-behavior.ts`: Sets 'wanderTarget' and 'wanderStartTime' - cleanup needs verification

**Impact:**
- LOW to MEDIUM: Could cause memory accumulation over very long game sessions
- Stale data might interfere with future behavior execution in edge cases

**Recommendation:**
- Add explicit cleanup in FAILURE paths for all behaviors that use blackboard keys
- Consider a naming convention: temp_ prefix for keys that should be cleaned up
- Add periodic blackboard audit/cleanup for stale keys

---

### 3. Sequence re-evaluation behavior (Not a bug, but worth documenting)

**Issue:**
Sequences re-evaluate ALL preceding nodes on each tick, even when a later child is RUNNING.

**Example:**
```
Sequence([
  ConditionNode(isHungry),
  ActionNode(eat)  // RUNNING
])
```

If the condition becomes false while eating is RUNNING, the sequence will fail on the next tick.

**Impact:**
- By design for reactive behavior trees
- Could surprise developers unfamiliar with this pattern
- May cause unexpected behavior interruptions

**Recommendation:**
- Document this behavior clearly
- Developers should understand that conditions are re-checked every tick
- This is correct but requires careful behavior design

---

## Framework Validation

### ✅ Working Correctly

1. **Selector Node:**
   - ✓ Correctly maintains runningChildIndex
   - ✓ Resumes from RUNNING child
   - ✓ Does not execute children after RUNNING child
   - ✓ Properly handles state transitions

2. **Sequence Node:**
   - ✓ Re-evaluates all nodes each tick (reactive)
   - ✓ Fails immediately if any child fails
   - ✓ Returns RUNNING when a child is RUNNING

3. **Blackboard:**
   - ✓ Properly isolated between entities
   - ✓ Old node execution data can be cleaned up
   - ✓ History is automatically pruned

4. **CachingNode:**
   - ✓ Caches SUCCESS and FAILURE
   - ✓ Does NOT cache RUNNING (correct)
   - ✓ Respects cache duration
   - ✓ Honors validity checks

5. **TimeoutNode:**
   - ✓ Tracks start time correctly
   - ✓ Fails after timeout
   - ✓ Cleans up blackboard keys

---

## Individual Behavior Analysis

### Eating Behavior
- ✓ Correctly checks hunger threshold
- ✓ Respects cooldown
- ✓ Checks for food availability
- ✓ Rejects children (isAdult check)

### Gathering Behavior
- ✓ Checks hunger and inventory capacity
- ✓ Uses CachingNode for expensive searches
- ✓ Handles empty bushes correctly
- ⚠️ Needs verification: cleanup of 'foodSource' on all failure paths

### Attacking Behavior
- ✓ Checks for valid enemies
- ✓ Avoids dead targets
- ✓ Implements leash (max distance from home)
- ✓ Cleans up blackboard on give-up

### Fleeing Behavior
- ✓ Checks health threshold
- ✓ Finds closest aggressor
- ⚠️ Does not clean up 'fleeThreat' key

### Planting Behavior
- ✓ Checks berry inventory
- ✓ Checks hunger threshold
- ✓ Uses CooldownNode for search
- ✓ Validates planting spot availability

---

## Test Coverage

### Created Tests:
1. `behavior-tree.test.ts` - Framework tests (24 tests, all passing)
2. `behavior-tester.ts` - Systematic behavior testing utility
3. `cooldown-bug-analysis.ts` - CooldownNode bug reproduction
4. `selector-analysis.ts` - Selector state management verification
5. `blackboard-cleanup-analysis.ts` - Memory management analysis

### Test Results:
- Framework tests: 24/24 passing ✓
- CooldownNode bug: Confirmed ❌
- Selector behavior: Verified correct ✓
- Blackboard isolation: Verified correct ✓

---

## Recommendations

### High Priority:
1. **Fix CooldownNode bug** - Affects multiple behaviors
2. **Review all Blackboard.set() calls** - Ensure cleanup on failure paths

### Medium Priority:
1. Add explicit blackboard cleanup in fleeing-behavior
2. Document Sequence re-evaluation behavior for developers
3. Add debug mode to detect stale blackboard keys

### Low Priority:
1. Consider adding periodic blackboard auditing
2. Add naming convention for temporary blackboard keys
3. Consider max key limit for very long game sessions

---

## Testing Methodology

The testing approach used:
1. Unit tests for individual nodes
2. Integration tests for node combinations
3. Edge case analysis (timeouts, failures, interruptions)
4. Memory management analysis
5. Blackboard state tracking

This revealed issues that wouldn't be found through normal gameplay testing.
