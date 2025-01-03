# Game World Refactoring Plan

## Current State Analysis

### Code Structure

- Game world code is tightly coupled
- Lion and prey have separate, specific implementations
- Entity interactions are hardcoded
- No generic entity system

### Key Issues

- Limited extensibility
- Duplicate code across entity types
- Complex state management
- Hard to add new entity types

## Target Architecture

### Core Components

#### 1. Generic Entity Type

```typescript
type Entity = {
  id: string;
  type: 'lion' | 'prey' | string; // extensible for future entities
  position: Vector2D;
  state: EntityState;
  movement: MovementState;
  interactions: InteractionState;
};
```

#### 2. Entity Interactions

```typescript
type Interaction = {
  source: Entity;
  target: Entity;
  type: 'chase' | 'flee' | 'eat' | string; // extensible
};

type InteractionHandler = (state: GameState, interaction: Interaction) => GameState;
```

#### 3. Entity Control

```typescript
type Control = {
  entityId: string;
  action: 'move' | 'interact' | string;
  params: any;
};

type ControlHandler = (state: GameState, control: Control) => GameState;
```

## Implementation Plan

### Phase 1: Type System Preparation

#### Files to Modify

1. `/src/screens/play/game-world/game-world-types.ts`

   - Add generic Entity interface
   - Define interaction types
   - Update existing types for compatibility
     Dependencies:
   - coordinate-utils.ts
   - prey-types.ts

2. `/src/screens/play/game-world/coordinate-utils.ts`
   - Update utility functions for generic entities
   - Add new type-agnostic helper functions
     Dependencies:
   - game-world-types.ts
   - render-state.ts

### Phase 2: Entity System Implementation

#### Files to Create

1. `/src/screens/play/game-world/entity-system.ts`

   - Implement generic entity management
   - Define entity state transitions
   - Create entity update pipeline
     Dependencies:
   - game-world-types.ts
   - coordinate-utils.ts

2. `/src/screens/play/game-world/entity-interactions.ts`
   - Define interaction resolution system
   - Implement interaction handlers
   - Create interaction queue management
     Dependencies:
   - game-world-types.ts
   - entity-system.ts

#### Files to Modify

1. `/src/screens/play/game-world/lion-update.ts`

   - Convert to use generic entity system
   - Implement lion-specific behaviors
   - Update state management
     Dependencies:
   - entity-system.ts
   - game-world-types.ts

2. `/src/screens/play/game-world/prey-update.ts`

   - Adapt to generic entity system
   - Convert prey behaviors
   - Update state handling
     Dependencies:
   - entity-system.ts
   - game-world-types.ts
   - prey-types.ts

3. `/src/screens/play/game-world/prey-behavior.ts`
   - Update for generic entity compatibility
   - Convert behavior handlers
   - Implement prey-specific interactions
     Dependencies:
   - entity-system.ts
   - entity-interactions.ts

### Phase 3: State Management Refactoring

#### Files to Modify

1. `/src/screens/play/game-world/game-world-update.ts`
   - Implement generic entity processing
   - Add interaction processing
   - Update state management
     Dependencies:
   - entity-system.ts
   - entity-interactions.ts
   - game-world-types.ts

### Phase 4: System Integration

#### Files to Update

1. `/src/screens/play/game-world/game-world-init.ts`

   - Update entity initialization
   - Implement new state structure
     Dependencies:
   - game-world-types.ts
   - entity-system.ts

2. `/src/screens/play/game-render/game-renderer.ts`
   - Update rendering for generic entities
   - Add new entity type support
     Dependencies:
   - game-world-types.ts
   - entity-system.ts

### Implementation Guidelines

#### Code Style

- Use pure functions
- Maintain immutable state
- Clear type definitions
- Minimal abstraction
- Descriptive naming

### Success Criteria

#### Functionality

- [ ] All current game mechanics work
- [ ] No performance regression
- [ ] Entity system is generic
- [ ] Interactions are flexible

#### Code Quality

- [ ] Pure functions used
- [ ] Clear type definitions
- [ ] No duplicate code
- [ ] Code is easy to understand

#### Extensibility

- [ ] Easy to add entities
- [ ] Simple to add interactions
- [ ] Clear upgrade path
- [ ] Documented API

## Migration Strategy

### Step 1: Parallel Implementation

- Keep existing code working
- Build new system alongside
- Implement feature parity

### Step 2: Gradual Migration

- Move one entity type at a time
- Verify each step
- Maintain game functionality

### Step 3: System Switch

- Switch to new system
- Remove old implementation

### Step 4: Cleanup

- Remove unused code
- Update documentation

## Documentation Requirements

### Code Documentation

- Clear type definitions
- Function documentation
- Usage examples
- Architecture overview

### Development Docs

- Update GENAICODE_TRACKER.md
- Maintain GENAICODE_INSTRUCTIONS.md
- Document design decisions
- Track progress
