# Performance Profiling Guide

## How to Use the Profiler

The tribe2 game now includes a built-in performance profiler that can help identify bottlenecks.

### Enabling the Profiler

1. Start the game normally
2. Press `Shift + #` to enable the profiler
3. Play the game or let it run for a while (especially with >100 humans)
4. Press `Shift + #` again to disable the profiler and print results to the browser console

### Reading the Results

The profiler will output:
- **Total Time**: Total time spent in each operation across all calls
- **Avg Time**: Average time per call
- **Count**: Number of times the operation was called
- **Percentage**: What % of total profiled time this operation took

### What to Look For

Focus on operations with:
1. High total time (>100ms over the profiling period)
2. High average time (>1ms per call)
3. High frequency (called many times per frame)

## Known Profiled Operations

The profiler tracks these key operations:

### World Update
- `indexWorldState` - Creating spatial indexes for entities
- `entitiesUpdate` - Updating all entities
- `interactionsUpdate` - Processing entity interactions
- `updateViewport` - Camera movement
- `updateNotifications` - Notification system
- `updateEcosystemBalancer` - Ecosystem balancing
- `updateNotificationEffects` - Visual notification effects
- `visualEffectsUpdate` - Visual effects processing
- `updateTutorial` - Tutorial system
- `updateUI` - UI state updates

### Rendering
- `renderWorld` - Main world rendering
- `findPlayerEntity` - Finding the player character
- `sortEntities` - Sorting entities by render order
- `filterVisibleEntities` - Culling off-screen entities
- `renderEntities` - Rendering all visible entities
- `renderVisualEffects` - Rendering effects
- `renderHighlights` - Rendering entity highlights

## Expected Bottlenecks with >100 Humans

Based on code analysis, expect these to be slow:

1. **indexWorldState** - Rebuilds Flatbush spatial indexes every frame
2. **sortEntities** - Sorts ALL entities every frame (not just visible ones)
3. **AI updates** - Each human runs behavior tree logic
4. **renderEntities** - Renders each visible entity with wrapping

## Optimization Priority (Data-Driven Approach)

1. **Run the profiler** with >100 humans in the game
2. **Identify the top 3 bottlenecks** from the profiler output
3. **Optimize in order** of impact (highest % of time first)
4. **Re-profile** to validate improvements
5. **Repeat** until target performance is achieved

## Performance Targets

- **Frame Time**: <16.67ms (60 FPS)
- **World Update**: <10ms per frame
- **Rendering**: <6ms per frame
- **AI Updates**: Should be distributed across frames
