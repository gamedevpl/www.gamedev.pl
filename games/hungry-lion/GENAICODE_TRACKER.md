# GENAICODE TRACKER: R&D Tree

## Root: Project Start

- ✅ Project initialization and configuration

## Branch: Core Game Mechanics

- Lion Core Systems

  - ✅ Movement: Basic/continuous movement, mouse/touch input, viewport tracking
  - ✅ Chase Mechanism and Prey Catching
  - ✅ Fix mouse click movement: Ensure lion continues moving to clicked point after mouse button release.
  - ✅ Hunger Mechanics: Decay, starvation, visual feedback (Pixel art stomach icon on canvas, size adjusted to match action bar buttons)
    - ✅ Add pulsing effect to hunger icon when critically low
  - ✅ Target Notification System
  - ✅ Ambush Mechanics: State management, speed boost
    - ✅ Fix: Clicking ground while in ambush no longer switches state to 'walk'.
    - ☐ Visual feedback for ambush state
    - ☐ Reduced visibility effect on prey
  - ✅ Eating Mechanics: Dedicated state, transitions, visual feedback
  - ✅ Action Bar Implementation: Basic UI, state management
    - ✅ Refactor ActionBar: Implemented exclusive actions (walk, attack, ambush) with corresponding lion stance icons on buttons. Updated event system and LionEntity state.
    - ✅ Fix Attack button: Ensure Attack button targets nearby prey similarly to Space key by refactoring attack initiation logic.
    - ☐ Enhanced styling, cooldowns, icons, tooltips
  - ✅ Implement Keyboard Controls (WASD/Arrows + SPACE): Movement via keys, context-aware SPACE action (attack/ambush/walk).
  - ☐ Stealth movement mechanics
  - ✅ Fix lion targeting and chasing across world wrap boundaries
  - ☐ Pathfinding for obstacle avoidance
  - ☐ Movement sound effects

- Prey Core Systems

  - ✅ Basic Implementation: Entity types, AI movement, spawning
  - ✅ Enhanced Behavior and Rendering
  - ✅ Fleeing Behavior: Lion proximity detection, acceleration
  - ✅ Panic and Group Behavior: Propagation, vision range, priority response
  - ✅ Code Refactoring: Consolidated behavior logic
  - ✅ Prey-to-Carrion Conversion: Timing, state transitions
  - ✅ Enhanced Debugging and Fleeing Behavior
  - ✅ Lion-Prey Interaction: Health system, debuff effects
  - ✅ Natural Movement: Idle states, social behaviors, varied patterns
  - ✅ Health-Based Rendering: Color interpolation
  - ✅ Carrion Eating Mechanics: Food value, consumption
  - ☐ Advanced Group Dynamics: Leader-follower, cohesion
  - ☐ Flocking behavior

- Hunter Core Systems
  - ✅ Basic Implementation: Entity types, AI movement, shooting mechanics
  - ✅ State Machine: Patrolling, waiting, chasing, shooting, reloading states
  - ✅ Hunter-Lion Interaction: Shooting mechanics, damage system
  - ✅ Patrol Points System: Multiple patrol points with configurable radius
  - ✅ Combat Visual Feedback: Hit/miss notifications, damage indicators
  - ☐ Advanced Hunter AI: Coordinated hunting, strategic positioning
  - ☐ Hunter Equipment: Different weapon types, traps, tools
  - ☐ Hunter Difficulty Levels: Easy, medium, hard variants

## Branch: Game World

- ✅ Ground Rendering Implementation
- ✅ Code Organization: Split into focused modules
- ✅ Game World V2 Implementation

  - ✅ Entity System: Types, states, management
  - ✅ Core Interactions: Collision detection/response
  - ✅ Basic Behaviors: Movement, bounds handling
  - ✅ Prey Spawning System
  - ☐ Advanced Interactions and Behaviors

  - ✅ Planet-like Recursive World: Implemented seamless position/visual wrapping and updated distance calculations.

## Branch: Interactions

- ✅ Lion Targeting System
- ✅ Prey Catching and Eating Mechanics
- ✅ Debug Visualization System: State debugging, timing controls
- ✅ Combat Notification System: Visual feedback for hits, misses, and damage
  - ✅ Notification Types: Combat, system, status categories
  - ✅ Notification Rendering: Animated text with fade effects
  - ✅ Notification Management: Creation, updating, and cleanup
  - ☐ Advanced Effects: Particle effects, sound integration
  - ☐ Notification Aggregation: Combining similar notifications

## Branch: UI Improvements

- ✅ Convert Action Bar to Canvas Rendering
  - ✅ Create action-bar-renderer.ts
  - ✅ Update hunger-renderer.ts positioning
  - ✅ Integrate renderers in game-renderer.ts
  - ✅ Update input-controller.ts for canvas button interaction
  - ✅ Remove ActionBar React component from game-viewport.tsx
  - ✅ Delete action-bar.tsx file
  *Description: Replaced the React-based Action Bar with direct canvas rendering for better integration and consistent UI layer. Buttons are drawn in `action-bar-renderer.ts` and interactions handled in `input-controller.ts`. Positioned at bottom-center alongside the hunger indicator.*

## Branch: Visual Improvements

- ☐ Replace triangle with proper lion sprite
- ☐ Add movement animations and direction indicators
- ✅ Enhanced Target Notification System: Icon-based, visual feedback
- ✅ Combat Feedback: Hit/miss indicators, damage notifications
- ✅ Fix Environment Rendering Wrap: Ensured grass and water sectors render correctly across world boundaries.
- ☐ Visual Feedback for Fleeing

## Branch: Technical Improvements

- ✅ Enhanced Debug System: Configurable timing, state visualization
- ✅ Ground Rendering Optimization: Canvas caching
- ✅ Notification System: Modular, extensible framework for game feedback
- ☐ Movement optimizations and prediction
- ☐ Performance Optimizations: Spatial partitioning, behavior caching

## Future Considerations

- Game World: Entity component system, hierarchies, event system
- Group Behavior: Personality types, learning behavior, decision making
- Fleeing Mechanics: Threat intensity, recovery behaviors, environmental factors
- Performance: Quadtree spatial partitioning, caching, optimization
- Debug System: State transition history, timeline view, metrics analysis
- Notification System: Sound effects, particle effects, aggregation of similar notifications
