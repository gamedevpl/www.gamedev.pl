# Performance Optimization Approach - Summary

## Problem Statement
The tribe2 game experiences performance issues when there are >100 humans in the world and on screen.

## Approach Taken: Data-Driven Optimization

### Why Profile First?
**Premature optimization is the root of all evil** - Donald Knuth

Without profiling data, we risk:
- Optimizing code that isn't actually slow
- Missing the real bottlenecks
- Adding complexity without measurable benefit
- Wasting development time on low-impact changes

### What Was Implemented

#### 1. Performance Profiler Infrastructure
- **File**: `src/game/performance-profiler.ts`
- **Features**:
  - Hierarchical timing measurements
  - Minimal overhead when disabled
  - Easy start/end API
  - Detailed reporting with statistics

#### 2. Profiling Instrumentation
Added profiling calls to key areas:
- **World Update** (`world-update.ts`):
  - indexWorldState
  - entitiesUpdate
  - interactionsUpdate
  - All subsystem updates

- **Rendering** (`render-world.ts`):
  - Entity sorting
  - Visibility filtering
  - Entity rendering
  - Effect rendering

#### 3. User-Friendly Controls
- **Keyboard Shortcut**: `Shift + #`
  - First press: Enable profiler and start collecting data
  - Second press: Disable profiler and print results to console
- Results show:
  - Total time per operation
  - Average time per call
  - Call frequency
  - Percentage of total time

#### 4. Documentation
- **PROFILING_GUIDE.md**: Step-by-step guide for using the profiler
- Instructions on interpreting results
- Performance targets and expectations

### How to Use This

1. **Run the game** with >100 humans
2. **Press Shift+#** to start profiling
3. **Play/observe** for 30-60 seconds
4. **Press Shift+#** again to see results
5. **Identify bottlenecks** from the console output
6. **Optimize the top 3** most expensive operations
7. **Re-profile** to confirm improvements
8. **Repeat** until performance targets are met

### Expected Workflow

```
┌─────────────────┐
│  Enable Profiler │
│   (Shift + #)    │
└────────┬─────────┘
         │
         v
┌─────────────────┐
│  Run Game with  │
│  >100 Humans    │
└────────┬─────────┘
         │
         v
┌─────────────────┐
│ Disable Profiler│
│   (Shift + #)   │
└────────┬─────────┘
         │
         v
┌─────────────────┐
│ Analyze Results │
│  in Console     │
└────────┬─────────┘
         │
         v
┌─────────────────┐
│  Optimize Top 3 │
│   Bottlenecks   │
└────────┬─────────┘
         │
         v
┌─────────────────┐
│  Re-profile &   │
│    Validate     │
└─────────────────┘
```

### Why This Approach is Better

1. **Evidence-Based**: Optimizations based on actual measurements
2. **Targeted**: Focus effort on real bottlenecks
3. **Measurable**: Can quantify improvements
4. **Iterative**: Profile → Optimize → Validate → Repeat
5. **No Guesswork**: Know exactly what to optimize

### Next Steps for Developer

1. Build and run the game
2. Create a scenario with 100+ humans
3. Use the profiler (Shift+#)
4. Share the profiling results
5. We'll implement targeted optimizations based on actual data

## Code Analysis Predictions (To Be Verified)

While we haven't profiled yet, code analysis suggests these areas might be slow:

### Likely Bottlenecks
1. **`indexWorldState()`** - Called every frame, rebuilds Flatbush indexes
   - Creates new spatial index for every entity type
   - O(n log n) complexity for n entities

2. **`sortEntities()`** - Sorts ALL entities, not just visible ones
   - Runs before visibility filtering
   - O(n log n) for all entities

3. **Entity Rendering** - Renders with 9x wrapping for all entities
   - Even entities not near world edges
   - Unnecessary renderWith Wrapping calls

4. **AI Updates** - All entities update on same frames
   - No staggering of updates
   - Creates update spikes

### Proposed Optimizations (After Profiling Confirms)

If profiling confirms these bottlenecks:

1. **Index Caching**:
   ```typescript
   // Only rebuild index when entity count changes
   if (cachedEntityCount !== currentEntityCount) {
     rebuildIndex();
   }
   ```

2. **Sort Optimization**:
   ```typescript
   // Filter first, then sort
   const visible = filterVisible(entities);
   const sorted = sort(visible);
   ```

3. **Smart Wrapping**:
   ```typescript
   // Only wrap if near world edges
   if (isNearEdge(entity)) {
     renderWithWrapping();
   } else {
     renderOnce();
   }
   ```

4. **AI Staggering**:
   ```typescript
   // Stagger updates by entity ID
   const updateOffset = (entity.id % 10) * 0.1;
   if (timeSinceUpdate >= interval + updateOffset) {
     updateAI();
   }
   ```

## Conclusion

This PR provides the tools needed to profile and optimize the game performance properly. The next step is to actually run the profiler with >100 humans and use the data to drive optimization decisions.

**Remember**: Measure first, optimize second, validate third.
