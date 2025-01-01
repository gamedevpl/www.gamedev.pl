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
        *   ✅ Enhanced Prey Fleeing Behavior
        *   ✅ Debug Rendering for Fleeing State
        *   ✅ Fixed Prey Fleeing Immediately on Click
        *   ✅ Panic and Group Behavior
            *   ✅ Implemented panic state propagation
            *   ✅ Added panic vision range and duration
            *   ✅ Enhanced prey awareness of fleeing neighbors
            *   ✅ Implemented priority-based threat response
            *   ✅ Added group panic behavior mechanics
            *   ✅ Unified fleeing and panic states
        *   ✅ Code Refactoring and Optimization
            *   ✅ Consolidated prey behavior logic into `prey-behavior.ts`
            *   ✅ Centralized threat detection in `threat-detection.ts`
            *   ✅ Enhanced coordinate utilities in `coordinate-utils.ts`
            *   ✅ Removed code duplication between `prey-update.ts` and `prey-ai.ts`
        *   ☐ Advanced Group Dynamics
            *   ☐ Implement leader-follower behavior
            *   ☐ Add group cohesion mechanics
            *   ☐ Develop group decision making
            *   ☐ Add communication between prey
            *   ☐ Implement threat level assessment
            *   ☐ Add variable fleeing speeds based on threat
        *   ☐ Implement flocking behavior
            *   ☐ Add separation behavior
            *   ☐ Add alignment behavior
            *   ☐ Add cohesion behavior
            *   ☐ Balance flocking parameters

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
    *   ☐ Add particle effects for movement
    *   ☐ Visual Feedback for Fleeing
        *   ☐ Add fleeing indicators
        *   ☐ Implement visual stress levels
        *   ☐ Add group fleeing visualization

## Branch: Gameplay Enhancements
    *   ☐ Add hunting mechanics
    *   ☐ Implement stamina system
    *   ☐ Create environmental obstacles
    *   ☐ Enhanced Group Mechanics
        *   ☐ Add group formations
        *   ☐ Implement safe zones
        *   ☐ Add group leadership roles

## Branch: Technical Improvements
    *   ☐ Optimize movement calculations
    *   ☐ Add movement prediction
    *   ☐ Implement collision detection
    *   ☐ Add movement replay system
    *   ☐ Performance Optimizations
        *   ☐ Optimize fleeing calculations
        *   ☐ Implement spatial partitioning
        *   ☐ Add behavior caching
        *   ☐ Optimize group calculations

## Future Considerations
    *   Group Behavior Enhancement
        *   Consider implementing different personality types for prey
        *   Add learning behavior based on past experiences
        *   Implement more sophisticated group decision making
        *   Add memory of safe/dangerous areas
    *   Advanced Fleeing Mechanics
        *   Add varying levels of threat intensity
        *   Implement recovery behaviors
        *   Add environmental factors affecting fleeing
        *   Create safe zones that reduce threat perception
        *   Implement energy consumption during fleeing
        *   Add fatigue mechanics affecting flee speed
    *   Performance Optimization
        *   Implement quadtree for spatial partitioning
        *   Add behavior caching for group decisions
        *   Optimize fleeing propagation algorithms
        *   Add level of detail system for distant entities