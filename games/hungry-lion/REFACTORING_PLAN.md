# Game World Refactoring Plan

## Current State
- Game world code is tightly coupled
- Lion and prey have separate, specific implementations
- Entity interactions are hardcoded
- No generic entity system

## Target State
- Generic entity system
- Entities can interact with each other
- Any entity could potentially be player-controlled
- Simple, functional code style

## Core Components

### 1. Generic Entity Type
```typescript
type Entity = {
  id: string;
  type: 'lion' | 'prey' | string; // extensible for future entities
  position: Vector2D;
  state: EntityState;
  movement: MovementState;
  interactions: InteractionState;
}
```

### 2. Entity Interactions
```typescript
type Interaction = {
  source: Entity;
  target: Entity;
  type: 'chase' | 'flee' | 'eat' | string; // extensible
}

type InteractionHandler = (state: GameState, interaction: Interaction) => GameState;
```

### 3. Entity Control
```typescript
type Control = {
  entityId: string;
  action: 'move' | 'interact' | string;
  params: any;
}

type ControlHandler = (state: GameState, control: Control) => GameState;
```

## Migration Plan

### Phase 1: Preparation
1. Create new type definitions without modifying existing code
2. Add new files alongside current implementation
3. Document all current entity interactions

### Phase 2: Entity System
1. Implement generic entity type
2. Convert lion to use generic entity type
3. Convert prey to use generic entity type
4. Validate both still work as before

### Phase 3: Interactions
1. Implement basic interaction system
2. Move lion-prey interactions to new system
3. Test and verify all interactions work
4. Remove old interaction code

### Phase 4: Control System
1. Implement generic control handler
2. Move lion control to new system
3. Test with current lion implementation
4. Remove old control code

## Implementation Guidelines

### Keep It Simple
- Use pure functions
- Maintain immutable state
- Avoid complex abstractions
- Focus on readability

### Testing Strategy
- Test each phase before moving to next
- Ensure game mechanics stay the same
- Verify performance isn't impacted

### Code Organization
- Group related functionality
- Keep files small and focused
- Use clear naming conventions

## Success Criteria
- ✅ Generic entity system works
- ✅ All current features work the same
- ✅ Code is simpler and cleaner
- ✅ Easy to add new entities
- ✅ Easy to add new interactions