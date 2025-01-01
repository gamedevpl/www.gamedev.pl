# GENAICODE TRACKER: R&D Tree

## Root: Project Start
  *   Initial Setup
      *   ✅ Project initialization
      *   ✅ Genaicode configuration

## Branch: Core Game Mechanics
    *   Lion Core Systems
        *   ✅ Basic movement system
        *   ✅ Mouse/touch input handling
        *   ✅ Target position tracking
        *   ✅ Simple visual representation
        *   ✅ Viewport tracking
        *   ✅ Single-step movement implementation
        *   ✅ Continuous movement when input is held
        *   ✅ Proper event handling for both mouse and touch inputs
        *   ✅ Clear distinction between single-step and continuous movement modes
        *   ✅ Chase Mechanism Refactoring
        *   ✅ Fixed Lion Movement on Mouse Release
        *   ✅ Improved Lion Movement and Prey Catching
        *   ✅ Hunger Mechanics
            *   ✅ Implemented hunger state
            *   ✅ Implemented hunger decay and starvation
            *   ✅ Added visual feedback for hunger levels
            *   ✅ Fixed Initial Hunger Mechanics
            *   ✅ Hunger Bar and Starvation Warnings
        *   ☐ Stealth movement mechanics
        *   ☐ Pathfinding for obstacle avoidance
        *   ☐ Movement sound effects
        *   ☐ Enhance visual feedback for movement states
        *   ☐ Add acceleration/deceleration curves
    *   Prey Core Systems
        *   ✅ Prey Entities Implementation
            *   ✅ Defined prey type and properties
            *   ✅ Initialized prey entities in the game world
            *   ✅ Implemented basic AI for prey movement
            *   ✅ Added spawning mechanic for prey
            *   ✅ Integrated prey rendering into the game
        *   ✅ Enhanced Prey Behavior
        *   ✅ Improved Prey Rendering
        *    ✅ Enhanced Prey Fleeing Behavior
        *   ✅ Debug Rendering for Fleeing State
        *   ✅ Fixed Prey Fleeing Immediately on Click
        *   ☐ Implement flocking behavior
    *   Input System
        *   ✅ Input System Refactoring

## Branch: Game World
    *   ✅ Ground Rendering Implementation
    *   ✅ Game World Code Organization
        *   ✅ Split game-world-update.ts into focused modules
        *   ✅ Created coordinate-utils.ts
        *   ✅ Created lion-update.ts
        *   ✅ Created prey-update.ts

## Branch: Interactions
    *   ✅ Lion Targeting System
    *   ✅ Prey Catching and Eating Mechanics
    *   ✅ Debug Catching Mechanics
    *   ✅ Enhanced Catching Mechanics

## Branch: Visual Improvements
    *   ☐ Replace simple triangle with proper lion sprite
    *   ☐ Add movement animations
    *   ☐ Implement direction indicators
    *  ☐ Add particle effects for movement

## Branch: Gameplay Enhancements
    *   ☐ Add hunting mechanics
    *   ☐ Implement stamina system
    *   ☐ Create environmental obstacles

## Branch: Technical Improvements
    *   ☐ Optimize movement calculations
    *   ☐ Add movement prediction
    *   ☐ Implement collision detection
    *   ☐ Add movement replay system
