# Game World V2 Architecture

## Introduction and Motivation

The game-world-v2 implementation aims to create a more maintainable, scalable, and robust architecture for the Hungry Lion game world. This refactoring effort addresses limitations in the current implementation while preserving its successful aspects.

### Why Refactor?

The current game world implementation has served well as a prototype but shows signs of technical debt:

- Complex state management across multiple files
- Tight coupling between game mechanics
- Inconsistent use of time-based operations
- Limited separation of concerns
- Challenges in adding new features or modifying existing ones

## Current Implementation Analysis

### Limitations in game-world/

1. **State Management Issues**

   - Direct state mutations across different modules
   - Lack of clear state update patterns
   - Inconsistent use of immutable patterns

2. **Temporal Logic Problems**

   - Direct usage of `Date.now()` makes testing difficult
   - Time-based mechanics scattered across modules
   - Inconsistent handling of delta time

3. **Coupling Issues**
   - Tight coupling between lion and prey behaviors
   - Direct dependencies between rendering and game logic
   - Hard-to-test interaction mechanics

### Successful Aspects Worth Preserving

1. **Functional Approach**

   - Pure functions for state updates
   - Immutable state transitions
   - Clear data flow in main update loop

2. **Type Safety**
   - Well-defined type system
   - Strong typing for game entities
   - Clear interface definitions

## Architectural Principles and Goals

### Core Principles

1. **Functional and Declarative**

   - Pure functions for state transitions
   - Immutable data structures
   - Predictable state updates
   - Clear data flow

2. **Separation of Concerns**

   - Clear boundaries between systems
   - Independent modules for different mechanics
   - Pluggable components

3. **Time Management**

   - Centralized game time management
   - Deterministic updates
   - Testable time-based mechanics

4. **Type Safety**
   - Enhanced type definitions
   - Strict typing for all systems
   - Compile-time guarantees

## Layer Architecture

### 1. Generic Entity System

```typescript
type Entity = {
  id: string;
  type: EntityType;
  position: Vector2D;
  // Common entity properties
};

type EntityState = {
  entities: Record<string, Entity>;
  // Additional state management
};
```

Responsibilities:

- Entity lifecycle management
- Common entity properties
- Basic entity operations

### 2. Collision Detection

```typescript
type Collidable = Entity & {
  bounds: BoundingBox;
};

type CollisionSystem = {
  detectCollisions: (entities: Entity[]) => Collision[];
};
```

Responsibilities:

- Spatial partitioning
- Collision detection
- Collision response

### 3. Interactions

```typescript
type Interaction = {
  source: Entity;
  target: Entity;
  type: InteractionType;
};

type InteractionSystem = {
  processInteractions: (state: GameState, interactions: Interaction[]) => GameState;
};
```

Responsibilities:

- Entity interaction rules
- State transitions from interactions
- Event generation

### 4. Entity Update

```typescript
type UpdateContext = {
  deltaTime: number;
  gameTime: number;
  // Additional context
};

type EntityUpdater = {
  update: (entity: Entity, context: UpdateContext) => Entity;
};
```

Responsibilities:

- Entity-specific update logic
- State transitions
- Behavior implementation

### 5. Math Helpers

```typescript
// Pure utility functions
const vector = {
  add: (v1: Vector2D, v2: Vector2D) => Vector2D;
  scale: (v: Vector2D, scalar: number) => Vector2D;
  // Other vector operations
};
```

Responsibilities:

- Vector mathematics
- Geometric calculations
- Physics helpers

### 6. Agentic AI Behavior

```typescript
type AIContext = {
  entity: Entity;
  worldState: GameState;
  perception: PerceptionData;
};

type AISystem = {
  computeAction: (context: AIContext) => Action;
};
```

Responsibilities:

- Decision making
- Pathfinding
- Behavior trees
- State machines

## Migration Strategy

### Phase 1: Foundation

1. Set up new directory structure
2. Create base entity system
3. Implement core utilities

### Phase 2: Systems Migration

1. Move collision detection
2. Migrate interaction system
3. Transfer AI behaviors

### Phase 3: Entity Migration

1. Migrate lion entity
2. Migrate prey entities
3. Update game world state

### Phase 4: Switch and clean up

1. Migrate usages of old game world to new game world
2. Delete old game world implementation
3. Rename new game world implementation from game-world-v2 to game-world

## Development Guidelines

1. **Code Organization**

   - One responsibility per file
   - Clear file naming
   - Consistent directory structure

2. **Type Safety**

   - Use TypeScript features
   - Define clear interfaces
   - Avoid any type

3. **State Management**
   - Immutable state updates
   - Pure functions
   - Clear update flow
