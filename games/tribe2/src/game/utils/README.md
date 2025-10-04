# Game Utilities

Collection of useful utility functions ported from Tribe 1.

## Math Utilities (`math-utils.ts`)

### Vector Operations
- `vectorAdd(v1, v2)` - Add two vectors
- `vectorSubtract(v1, v2)` - Subtract two vectors
- `vectorScale(v, scalar)` - Multiply vector by scalar
- `vectorLength(v)` / `vectorMagnitude(v)` - Get vector length
- `vectorNormalize(v)` - Normalize vector to unit length
- `vectorDistance(v1, v2)` - Calculate distance between vectors
- `vectorLerp(v1, v2, t)` - Linear interpolation between vectors
- `vectorDot(v1, v2)` - Dot product of two vectors
- `vectorAngleBetween(v1, v2)` - Calculate angle between vectors (radians)
- `vectorRotate(v, angle)` - Rotate vector by angle (radians)

### Toroidal World Utilities
- `getDirectionVectorOnTorus(from, to, worldWidth, worldHeight)` - Get shortest direction considering wrapping
- `calculateWrappedDistance(v1, v2, worldWidth, worldHeight)` - Calculate shortest distance with wrapping
- `dirToTarget(position, target, worldWidth, worldHeight)` - Get normalized direction to target with wrapping

### Helper Functions
- `getAveragePosition(positions)` - Calculate average of multiple positions
- `lerpColor(color1, color2, t)` - Interpolate between two hex colors
- `clamp(value, min, max)` - Clamp value between min and max
- `randomRange(min, max)` - Generate random float in range
- `randomInt(min, max)` - Generate random integer in range (inclusive)

## Spatial Utilities (`spatial-utils.ts`)

### Position Helpers
- `getRandomNearbyPosition(center, radius, worldWidth, worldHeight)` - Get random position within radius
- `isPositionOccupied(position, gameState, checkRadius, ignoreEntityId?)` - Check if position is occupied by entities
- `findValidSpot(center, gameState, searchRadius, spotRadius, ignoreEntityId?)` - Find unoccupied spot near position

### Entity Queries
- `findNearbyEntities(position, radius, gameState, excludeEntityId?)` - Get all entities within radius
- `findClosestEntity(position, gameState, excludeEntityId?)` - Find closest entity to position

## Usage Examples

```typescript
import { vectorAdd, vectorScale, calculateWrappedDistance, findNearbyEntities } from './game/utils';

// Move entity with vector math
const velocity = { x: 100, y: 50 };
const deltaTime = 0.016;
const movement = vectorScale(velocity, deltaTime);
const newPosition = vectorAdd(entity.position, movement);

// Calculate distance on toroidal world
const distance = calculateWrappedDistance(
  player.position,
  target.position,
  gameState.worldWidth,
  gameState.worldHeight
);

// Find nearby entities
const nearby = findNearbyEntities(
  player.position,
  100, // radius
  gameState,
  player.id // exclude player
);

// Get direction to target (considers wrapping)
const direction = dirToTarget(
  player.position,
  target.position,
  gameState.worldWidth,
  gameState.worldHeight
);
```

## Benefits

- **Tested and proven** - All functions ported from working Tribe 1 code
- **Toroidal world support** - Properly handles world wrapping for seamless boundaries
- **Performance optimized** - Efficient spatial queries and calculations
- **Type-safe** - Full TypeScript support with proper types
- **Reusable** - Generic functions applicable to many game scenarios
