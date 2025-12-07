# Behavior Tree Bugs and Findings

## Bugs Found During Testing

### Bug #1: animal-wander-behavior.ts - Incorrect falsy check for wanderStartTime

**Location**: `animal-wander-behavior.ts:25`

**Severity**: Medium

**Description**:
The condition `!wanderStartTime` incorrectly treats `0` as a falsy value, causing the wander target to be regenerated even when it shouldn't be. Since `0` is a valid game time (start of game), this causes the behavior to always regenerate the target on every tick if the game starts at time 0.

**Current Code**:
```typescript
if (!wanderTarget || !wanderStartTime || currentTime - wanderStartTime > 2) {
```

**Problem**:
- When `wanderStartTime === 0`, `!wanderStartTime` evaluates to `true`
- This causes unnecessary regeneration of wander targets

**Proposed Fix**:
```typescript
if (!wanderTarget || wanderStartTime === undefined || currentTime - wanderStartTime > 2) {
```

**Test Evidence**:
- Test: "should reuse wander target within time window" - FAILED
- Test: "should handle time exactly at 2 hour boundary" - FAILED

**Impact**:
- Animals may change direction more frequently than intended
- Minor performance impact from unnecessary calculations
- Behavior is not as intended (less stable wandering)

---

### Bug #2: animal-wander-behavior.ts - World wrapping in direction calculation

**Location**: `animal-wander-behavior.ts:64-69`

**Severity**: Low

**Description**:
The direction calculation attempts to handle world wrapping, but the logic may not be correct in all cases. When the animal is near one edge and the target is near the opposite edge, the direction should point in the shorter wrapped path, but the implementation may not always do this correctly.

**Current Code**:
```typescript
if (Math.abs(dx) > mapWidth / 2) {
  dx = dx > 0 ? dx - mapWidth : dx + mapWidth;
}
if (Math.abs(dy) > mapHeight / 2) {
  dy = dy > 0 ? dy - mapHeight : dy + mapHeight;
}
```

**Test Evidence**:
- Test: "should handle world wrapping in direction calculation" - Sometimes FAILS
- The direction doesn't always point in the expected direction when wrapping is involved

**Status**: Needs further investigation

**Potential Issue**:
The wrapping logic may be correct, but the test expectations might be wrong. The behavior might be working as intended but in a non-obvious way. Further analysis needed to determine if this is a real bug or a test issue.

---

## Framework Issues to Investigate

### Issue #1: Circular import when testing fleeing-behavior

**Location**: `fleeing-behavior.test.ts`

**Severity**: High (blocks testing)

**Description**:
When attempting to import and test `fleeing-behavior.ts`, a circular dependency error occurs:
```
ReferenceError: Cannot access '__vite_ssr_import_4__' before initialization
```

**Impact**:
- Cannot test fleeing behavior
- Suggests potential circular dependency in the module structure
- May affect other behaviors with similar dependency patterns

**Investigation Needed**:
- Map out the import dependency chain
- Identify circular dependencies
- Refactor to break circular dependencies if needed

---

## Testing Infrastructure Improvements

### Improvement #1: Blackboard usage in tests

**Discovery**:
Behaviors use the blackboard parameter for behavior-specific data, but use `entity.aiBlackboard` for node-specific state (like `lastStatus`). Tests must use `entity.aiBlackboard!` as the blackboard parameter, not a separate blackboard instance.

**Documentation**:
This should be clearly documented in test utilities to avoid confusion.

---

## Behaviors Tested

### ✅ idle-wander-behavior.ts
- **Status**: PASSED (7/7 tests)
- **Issues**: None found
- **Notes**: Simple behavior, works as expected

### ✅ eating-behavior.ts
- **Status**: PASSED (18/18 tests)
- **Issues**: None found
- **Notes**: Properly uses hunger threshold, cooldown, and food availability checks

### ⚠️ animal-wander-behavior.ts
- **Status**: FAILED (15/17 tests passed, 2 failed)
- **Issues**: 
  - Bug #1: Incorrect falsy check for wanderStartTime
  - Bug #2: Potential direction wrapping issue
- **Notes**: Core logic works, but edge cases need fixes

### ❌ fleeing-behavior.ts
- **Status**: NOT TESTED (circular import)
- **Issues**: Circular import prevents testing
- **Notes**: Need to resolve import issues before testing

---

## Next Steps

1. Fix Bug #1 in animal-wander-behavior.ts (falsy check)
2. Investigate Bug #2 further (direction wrapping)
3. Resolve circular import issue for fleeing-behavior.ts
4. Continue testing remaining behaviors systematically
5. Document all findings

---

## Statistics

- **Behaviors Tested**: 3 (idle-wander, eating, animal-wander)
- **Tests Written**: 42
- **Tests Passed**: 40
- **Tests Failed**: 2
- **Bugs Found**: 2 confirmed, 1 under investigation
- **Blockers**: 1 (circular import)
