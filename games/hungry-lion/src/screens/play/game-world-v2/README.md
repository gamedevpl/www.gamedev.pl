# Game World Refactoring

This doc explains the new game world architecture.

## Problems with old game-world/ implementation

This is a spaghetti style code, difficult to maintain, not separating concerns properly. There are some bugs.

## Good parts about old game-world/ implementation

It works more or less, it has proper functional style.

## Assumptions for new game world

- use simple functional style code
- be declarative
- avoid redundant code
- maintain game mechanics implemented by old game-world/
- do not use `Date.now()` function, rely on game world state time
- time unit is millisecond

## Layers

- generic entity system
- collision detection
- interactions
- entity update
- helpers like math
- agentic ai behavior

## Missing Features

The following features from game-world v1 are not yet implemented in game-world v2:

- **Lion Hunger State**: The hunger mechanics including hunger level, starvation, and visual feedback.
- **Prey Carrion Conversion**: The process of converting prey to carrion and the subsequent eating process.
- **Threat Detection**: The logic for detecting threats and initiating fleeing behavior.
- **Boundary Bouncing Logic**: The handling of entity movement at world boundaries.

# Implementation plan

1. Implement the new system entirely, ensure feature parity
2. Migrate usage of old system to the new system
3. Remove old system
4. Rename old system to new system
