# Performance Analysis Results - Tribe2 Game

## Test Configuration
- **Test Date**: December 8, 2024
- **Entities**: 219 total (150 additional humans + initial game entities)
- **Frames Simulated**: 300 (5 seconds at 60 FPS)
- **Real Time**: ~2.9 seconds

## Performance Results

### Overall Performance: ✅ GOOD
- **Average Frame Time**: 9.79ms
- **Target Frame Time**: 16.67ms (60 FPS)
- **Performance Margin**: 41% faster than target
- **Status**: **Meeting performance goals**

## Bottleneck Analysis

### Top 3 Bottlenecks

| Operation | % of Time | Total (ms) | Avg (ms) | Count |
|-----------|-----------|------------|----------|-------|
| 1. entitiesUpdate | 85.2% | 2496.45 | 8.32 | 300 |
| 2. interactionsUpdate | 12.3% | 361.31 | 1.20 | 300 |
| 3. indexWorldState | 1.8% | 52.96 | 0.18 | 300 |

### Detailed Breakdown

#### 1. entitiesUpdate (85.2% of update time)
**What it does**: Updates all entities (physics, AI, state machines)
- 219 entities × 300 frames = 65,700 entity updates
- Average: 0.038ms per entity update
- This includes:
  - Physics calculations (velocity, forces, position)
  - AI decision making (behavior trees)
  - State machine updates
  - Type-specific updates (human/prey/predator/corpse/building)

**Analysis**:
- Per-entity cost is very reasonable at 0.038ms
- With 219 entities, 8.32ms per frame is expected
- AI updates are already throttled (AI_UPDATE_INTERVAL = 1 game hour)
- Most time is likely in AI behavior tree execution

#### 2. interactionsUpdate (12.3% of update time)
**What it does**: Processes entity-to-entity interactions
- Average: 1.20ms per frame
- This handles gathering, eating, combat, procreation, etc.

**Analysis**:
- Relatively small overhead
- Scales with number of entities in proximity
- Already reasonably optimized

#### 3. indexWorldState (1.8% of update time)
**What it does**: Creates spatial indexes for entity queries
- Average: 0.18ms per frame
- Rebuilds Flatbush spatial indexes every frame

**Analysis**:
- Very small overhead
- Could be cached but impact would be minimal (<2ms improvement)

## Optimizations Implemented

### 1. Entity Physics Optimization
**File**: `src/game/entities/entity-update.ts`

**Changes**:
- Skip physics calculations for static entities (buildings, berry bushes)
- Only process debuffs if entity has debuffs
- Cache velocity magnitude to avoid recalculation
- Skip position updates for zero-velocity entities

**Impact**: Negligible (within measurement variance)
**Reason**: Physics is already quite optimized, most time is in AI

## Recommendations

### Current State (219 entities)
- ✅ Performance is EXCELLENT (41% faster than 60 FPS target)
- ✅ No optimizations needed for current scale
- ✅ System can handle current load easily

### Scaling Considerations (>300 entities)

If the game needs to scale beyond 300 entities, consider these optimizations in priority order:

#### High Impact Optimizations

1. **AI Update Staggering**
   - **Current**: All eligible entities update AI on same frame
   - **Proposed**: Distribute AI updates across multiple frames based on entity ID
   - **Expected Impact**: 10-15% reduction in peak frame time
   - **Implementation**: Add stagger offset based on `entity.id % N`

2. **Behavior Tree Optimization**
   - **Current**: Full behavior tree evaluation each AI update
   - **Proposed**: Cache behavior tree results, early exits for common cases
   - **Expected Impact**: 15-20% reduction in AI time
   - **Implementation**: Add result caching in Blackboard

3. **Spatial Partitioning for Interactions**
   - **Current**: Interactions check all nearby entities
   - **Proposed**: Use spatial grid to limit interaction checks
   - **Expected Impact**: 10-15% reduction in interaction time
   - **Implementation**: Already have spatial index, use it more aggressively

#### Medium Impact Optimizations

4. **Index Caching**
   - **Current**: Rebuild all indexes every frame
   - **Proposed**: Cache indexes, rebuild only when entity count changes
   - **Expected Impact**: 1-2% reduction (index is only 1.8% of time)
   - **Implementation**: Track entity count, reuse previous index if unchanged

5. **Batch Entity Updates**
   - **Current**: Process entities one-by-one
   - **Proposed**: Group similar entity types and batch process
   - **Expected Impact**: 3-5% reduction via better cache locality
   - **Implementation**: Process all humans, then all prey, then all predators

## Performance Projections

### Estimated Maximum Entities at 60 FPS
Based on current performance:
- **Current**: 219 entities @ 9.79ms/frame
- **Per-entity cost**: 0.045ms
- **60 FPS budget**: 16.67ms
- **Maximum without optimization**: ~370 entities
- **With optimizations**: ~500-600 entities

### Scaling Formula
```
Frame Time (ms) ≈ (Entity Count × 0.045) + 0.18 (indexing) + 1.20 (interactions)
```

At 100 humans:
- Expected frame time: ~6.5ms ✓
At 200 humans:
- Expected frame time: ~11ms ✓
At 400 humans:
- Expected frame time: ~19ms ⚠️ (slightly over 60 FPS, but close)

## Conclusion

**Current Performance**: ✅ EXCELLENT
- 9.79ms frame time with 219 entities
- 41% faster than 60 FPS target
- No immediate optimizations needed

**Scaling**: ✅ GOOD
- Can handle 300+ entities without modification
- Well-architected with room for optimization
- AI throttling already in place

**Next Steps**:
1. ✅ **DONE**: Profiling infrastructure complete
2. ✅ **DONE**: Baseline measurements taken
3. ⏭️ **OPTIONAL**: Implement optimizations when entity count approaches 300
4. ⏭️ **MONITOR**: Track performance as game grows

## Test Code
Performance test available in:
- `src/game/performance-profiling.test.ts`

Run with:
```bash
npm test -- performance-profiling.test.ts --run
```

## Profiling Tools
Toggle profiler in-game:
- **Keyboard**: `Shift + #`
- **Results**: Browser console

See `PROFILING_GUIDE.md` for more details.
