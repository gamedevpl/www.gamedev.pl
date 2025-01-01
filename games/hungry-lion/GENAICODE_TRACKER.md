# GENAICODE TRACKER

This is a list of tasks that were done or are planned for the project.

## Completed Tasks

### Project Setup

- [x] Initial project setup
- [x] Genaicode configuration and fine tuning

### Core Game Mechanics

- [x] Lion Movement System Implementation
  - Basic movement mechanics with step-based movement
  - Mouse/touch input handling
  - Target position tracking
  - Simple visual representation
  - Viewport tracking
- [x] Lion Targeting System
  - SET_LION_TARGET event handling in GameController
  - Game state updates with target position
  - Integration with input system
  - Mouse/touch target position support
- [x] Single-Step Movement Implementation
  - Single-step movement on click/tap
  - Continuous movement when input is held
  - Proper event handling for both mouse and touch inputs
  - Clear distinction between single-step and continuous movement modes
- [x] Ground Rendering Implementation
  - Simple canvas pattern for ground texture
  - Low performance impact
  - Modular ground rendering system
  - Fixed viewport translation issue
- [x] Prey Entities Implementation
  - Defined prey type and properties
  - Initialized prey entities in the game world
  - Implemented basic AI for prey movement
  - Added spawning mechanic for prey
  - Integrated prey rendering into the game
- [x] Enhanced Prey Behavior
  - Prey now flee when they see the lion moving towards them
  - Prey can see the lion if they are looking towards it, it is within a certain distance, and it is actually moving
- [x] Improved Prey Rendering
  - Prey are now rendered as rotated rectangles
  - Better visual feedback for different states (idle, moving, fleeing)
- [x] Enhanced Prey Fleeing Behavior
  - Implemented sustained fleeing state with duration tracking
  - Added safe distance requirement for returning to idle
  - Improved lion detection with better vision cone mechanics
  - Added random variations to fleeing direction
  - Enhanced visual feedback with dynamic colors and animations
  - Improved prey movement patterns during fleeing
  - Added pulsing effect and visual indicators for fleeing state
- [x] Debug Rendering for Fleeing State
  - Added debug rendering to visualize remaining fleeing time and safe distance condition
  - Enabled debug rendering only in dev mode
- [x] Lion Hunger Mechanics
  - Added hunger state to lion
  - Implemented hunger decay and starvation
  - Added visual feedback for hunger levels
- [x] Prey Catching and Eating Mechanics
  - Implemented prey catching mechanics
  - Added carrion state for prey
  - Implemented prey eating mechanics
  - Added sound effects for catching and eating prey
- [x] Fixed Initial Hunger Mechanics
  - Set initial hunger level to 50% for balanced gameplay
  - Properly initialized hunger state flags
  - Fixed immediate game over issue
  - Improved player experience with fair starting conditions
- [x] Debug Catching Mechanics
  - Added debug option to visualize distance between lion and prey
  - Added debug option to show whether catching is effective
  - Moved debug rendering code to a separate file for better organization
- [x] Enhanced Catching Mechanics
  - Implemented 'lock-on' system for catching prey
  - Lion continues chasing locked prey without constant input
  - Added chase cancellation by clicking/tapping elsewhere
  - Lion stops chasing if it catches the prey
  - Fixed coordinate conversion issues in prey targeting
  - Improved world coordinate calculation for accurate prey locking
  - Enhanced viewport translation handling for consistent movement
- [x] Input System Refactoring
  - Separated input handling from game world logic
  - Moved prey detection and locking logic to GameController
  - Moved coordinate calculations to GameWorldUpdate
  - Simplified input controller to handle only basic input events
  - Updated event type definitions to reflect new architecture
- [x] Movement Bug Fixes and Enhancements
  - Fixed lion not moving when clicking on grass
  - Fixed lion stopping when mouse is released
  - Implemented continuous chasing system
  - Added proper prey position tracking during chase
  - Enhanced movement mechanics for smoother chasing
  - Updated prey state handling for continuous chasing
- [x] Chase Mechanism Refactoring
  - Added chaseTarget property to lion state for direct prey tracking
  - Removed interval-based tracking in favor of state-based updates
  - Simplified event system by removing redundant events (LOCK_ON_PREY)
  - Improved chase logic in game world update
  - Enhanced prey targeting with cleaner implementation
  - Better state management for chase mechanics
  - More efficient and maintainable code structure
- [x] Fixed Lion Movement on Mouse Release
  - Modified mouse button event handling to prevent cancelling the chase on mouse up when a prey is targeted
  - The chase is now only cancelled if the user clicks elsewhere
- [x] Fixed Prey Fleeing Immediately on Click
  - Removed the `lion.targetPosition` check from prey-ai.ts
  - Prey now only flee if the lion is moving towards them and within their vision range and angle
- [x] Improved Lion Movement and Prey Catching
  - Lion now continuously follows the cursor while the mouse is held down
  - Prey only disappears when the lion is within the correct catching distance
  - Prey catching mechanics now follow the existing implementation: slowing down, converting to carrion, and then being eaten
- [x] Game World Code Organization
  - Split game-world-update.ts into focused modules:
    - coordinate-utils.ts: Coordinate calculation utilities
    - lion-update.ts: Lion movement and state management
    - prey-update.ts: Prey behavior and state updates
  - Improved code maintainability and readability
  - Better separation of concerns
  - Simplified main game world update logic
  - Preserved all existing functionality
  - Enhanced code organization and modularity

## Planned Tasks

### Movement Refinement

- [ ] Add stealth movement mechanics
- [ ] Implement pathfinding for obstacle avoidance
- [ ] Add movement sound effects
- [ ] Enhance visual feedback for movement states
- [ ] Add acceleration/deceleration curves

### Visual Improvements

- [ ] Replace simple triangle with proper lion sprite
- [ ] Add movement animations
- [ ] Implement direction indicators
- [ ] Add particle effects for movement

### Gameplay Enhancements

- [ ] Add hunting mechanics
- [ ] Implement stamina system
- [ ] Create environmental obstacles

### Technical Improvements

- [ ] Optimize movement calculations
- [ ] Add movement prediction
- [ ] Implement collision detection
- [ ] Add movement replay system