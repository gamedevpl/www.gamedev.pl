# Behavior Testing Quick Start Guide

This guide helps you continue systematic testing of behavior tree behaviors.

## Running Existing Tests

```bash
cd games/tribe2

# Run all behavior tests
npm run test:run -- __tests__/

# Run specific test file
npm run test:run -- __tests__/eating-behavior.test.ts

# Run tests in watch mode (for development)
npm test -- __tests__/
```

## Creating a New Behavior Test

### 1. Create Test File

```bash
cd games/tribe2/src/game/ai/behavior-tree/behaviors/__tests__
touch my-behavior.test.ts
```

### 2. Use Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMyBehavior } from '../my-behavior';
import { createMockHuman, createMockContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard } from '../../behavior-tree-blackboard';

describe('My Behavior', () => {
  let human: ReturnType<typeof createMockHuman>;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    human = createMockHuman();
    context = createMockContext();
  });

  describe('Condition Tests', () => {
    it('should FAIL when condition not met', () => {
      // Arrange: set up test conditions
      human.hunger = 10;
      
      // Act: execute behavior
      const behavior = createMyBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Assert: verify result
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe('Action Tests', () => {
    it('should execute action when conditions met', () => {
      // Arrange
      human.hunger = 80;
      
      // Act
      const behavior = createMyBehavior(0);
      const status = behavior.execute(human, context, human.aiBlackboard!);
      
      // Assert
      expect(status).toBe(NodeStatus.RUNNING);
      expect(human.activeAction).toBe('eating');
    });
  });
});
```

### 3. Test Checklist

For each behavior, test:
- ✅ Condition checks (all branches)
- ✅ Action execution (state changes)
- ✅ Edge cases (boundaries, thresholds)
- ✅ Blackboard usage (data storage/retrieval)
- ✅ Return statuses (SUCCESS, FAILURE, RUNNING)
- ✅ Multiple executions (state persistence)

## Using Test Utilities

### Create Mock Entities

```typescript
import { 
  createMockHuman,
  createMockPrey,
  createMockPredator,
  createMockContext,
  addEntityToContext,
  advanceTime
} from './behavior-test-utils';

// Human with custom properties
const human = createMockHuman({ 
  hunger: 50,
  position: { x: 100, y: 200 },
  isAdult: true
});

// Prey entity
const prey = createMockPrey({
  hunger: 30,
  position: { x: 300, y: 400 }
});

// Add to context
const context = createMockContext();
addEntityToContext(context, human);
addEntityToContext(context, prey);

// Advance game time
advanceTime(context, 10); // +10 hours
```

### Access Blackboard

```typescript
// IMPORTANT: Always use entity.aiBlackboard!
const behavior = createMyBehavior(0);
behavior.execute(human, context, human.aiBlackboard!);

// Get blackboard values
const target = Blackboard.get(human.aiBlackboard!, 'targetId');

// Set blackboard values (for setup)
Blackboard.set(human.aiBlackboard!, 'wanderTarget', { x: 100, y: 200 });
```

## Known Limitations

### Behaviors That Won't Work Yet ⚠️

These behaviors require search index infrastructure (not yet implemented):

- ❌ Any behavior using `findClosestEntity()`
- ❌ gathering-behavior.ts
- ❌ prey-graze-behavior.ts
- ❌ fleeing-behavior.ts (also has circular import)
- ❌ attacking-behavior.ts
- ❌ And ~30 more...

**Workaround**: Test simpler behaviors first (see recommendations below)

### Circular Import Issue ⚠️

- ❌ fleeing-behavior.ts cannot be imported in tests
- ❌ Any behavior that imports fleeing-behavior

**Workaround**: Skip these until module structure is refactored

## Recommended Testing Order

### Easy (No Dependencies)
1. ✅ idle-wander-behavior.ts - DONE
2. ✅ eating-behavior.ts - DONE
3. ✅ animal-wander-behavior.ts - DONE

### Medium (Some Dependencies)
These may work with current infrastructure:

4. player-command-behavior.ts - May be testable
5. diplomacy-behavior.ts - May be testable
6. Some procreation checks - Condition logic

### Complex (Requires Search Index)
These need `createMockIndexedContext()` implementation:

- gathering-behavior.ts
- attacking-behavior.ts
- All hunt/flee behaviors
- All social behaviors using findClosest*

## Debugging Tips

### Test Fails with "Cannot read property 'data' of undefined"

**Problem**: Not using entity.aiBlackboard

**Fix**:
```typescript
// ❌ Wrong
const status = behavior.execute(human, context, blackboard);

// ✅ Correct
const status = behavior.execute(human, context, human.aiBlackboard!);
```

### Test Fails with "Cannot read property 'berryBush' of undefined"

**Problem**: Behavior uses search index (not implemented)

**Fix**: Skip this behavior for now, or implement search index mocking

### Behavior Returns Unexpected Status

**Debug Steps**:
1. Check condition logic
2. Verify entity properties
3. Check blackboard state
4. Add console.log in behavior
5. Run test in isolation

## Adding Search Index Support

To unblock testing of most behaviors, implement:

```typescript
// In behavior-test-utils.ts

export function createMockIndexedContext() {
  const context = createMockContext();
  
  // Add search indexes
  (context.gameState as any).search = {
    berryBush: {
      all: () => [],
      byRadius: () => [],
      byRect: () => [],
    },
    human: {
      all: () => [],
      byRadius: () => [],
      byRect: () => [],
    },
    // ... other entity types
  };
  
  return context;
}
```

## Best Practices

### ✅ Do This

- Test one behavior at a time
- Test conditions separately from actions
- Use descriptive test names
- Test edge cases (exact thresholds)
- Check both positive and negative cases
- Document bugs in FINDINGS.md
- Use beforeEach for setup

### ❌ Avoid This

- Don't test multiple behaviors together
- Don't skip edge cases
- Don't use magic numbers (use constants)
- Don't ignore failing tests
- Don't commit .only() or .skip()
- Don't test implementation details

## Reporting Bugs

When you find a bug:

1. **Verify** it's a real bug (not test issue)
2. **Document** in FINDINGS.md:
   - Location (file, line)
   - Severity (High/Medium/Low)
   - Description
   - Test evidence
   - Proposed fix
3. **Fix** if simple and safe
4. **Test** the fix
5. **Report** in commit message

## Getting Help

- See **FINDINGS.md** for technical details
- See **SUMMARY.md** for overview
- See **behavior-test-utils.ts** for utilities
- See existing tests for examples
- Ask team for search index implementation

## Quick Reference

```typescript
// Entity creation
const human = createMockHuman({ hunger: 50 });
const prey = createMockPrey({ position: { x: 100, y: 100 } });

// Context setup
const context = createMockContext();
addEntityToContext(context, human);

// Time manipulation
advanceTime(context, 5); // +5 hours

// Behavior execution
const behavior = createMyBehavior(0);
const status = behavior.execute(human, context, human.aiBlackboard!);

// Assertions
expect(status).toBe(NodeStatus.SUCCESS);
expect(human.activeAction).toBe('moving');
expect(Blackboard.get(human.aiBlackboard!, 'key')).toBe(value);
```

## Next Steps

1. Pick a simple behavior from recommended list
2. Create test file from template
3. Write condition tests
4. Write action tests
5. Write edge case tests
6. Run tests: `npm run test:run -- __tests__/your-file.test.ts`
7. Fix any bugs found
8. Document in FINDINGS.md
9. Commit and push

Happy testing! 🎯
