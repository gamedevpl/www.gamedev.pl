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
        *   ✅ Ambush Mechanics
            *   ✅ Added 'ambush' action button to action bar
            *   ✅ Implemented LION_AMBUSH state with no movement
            *   ✅ Added speed boost when transitioning from ambush to chase
            *   ✅ Made ambush action mutually exclusive with walk/attack
            *   ✅ Implemented state transitions and boost duration
            *   ✅ Added proper type definitions and documentation
            *   ☐ Add visual feedback for ambush state
            *   ☐ Implement reduced visibility effect on prey behavior
            *   ☐ Add particle effects for speed boost
        *   ☐ Stealth movement mechanics
        *   ✅ Action Bar Implementation
            *   ✅ Basic action bar UI
            *   ✅ Walk/Attack action states
            *   ✅ Action state management
            *   ✅ State machine integration
            *   ✅ Visual feedback
            *   ☐ Enhanced action bar styling
            *   ☐ Action cooldowns
            *   ☐ Action icons
            *   ☐ Action tooltips
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
            *   ✅ Implemented fleeing behavior
            *   ✅ Added lion proximity detection
            *   ✅ Calculated fleeing direction
            *   ✅ Set higher acceleration during fleeing
            *   ✅ Integrated with existing entity update system
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
        *   ✅ Prey-to-Carrion Conversion and Eating Process
            *   ✅ Added 2-second conversion time from prey to carrion
            *   ✅ Added 10-second eating time for carrion
            *   ✅ Updated state transitions in `prey-behavior.ts`
            *   ✅ Modified `lion-update.ts` to handle new timing
            *   ✅ Ensured carrion does not move and is rendered distinctly
            *   ✅ Implemented carrion entity type
            *   ✅ Added carrion rendering with gray color and crosses
            *   ✅ Excluded carrion from collision detection
        *   ✅ Enhanced Debugging Capabilities
            *   ✅ Added dev configuration for prey states
            *   ✅ Added configurable timing constants
            *   ✅ Implemented detailed state visualization
            *   ✅ Added conversion and eating progress indicators
            *   ✅ Enhanced debug panel with timing controls
        *   ✅ Enhanced Fleeing Behavior
            *   ✅ Added angle-based detection logic
            *   ✅ Reduced detection distance when lion is behind prey
            *   ✅ Updated fleeing state transitions
        *   ✅ Lion-Prey Interaction Implementation
            *   ✅ Added health property to PreyEntity
            *   ✅ Implemented health reduction when touched by lion
            *   ✅ Added force application towards lion
            *   ✅ Implemented conversion to carrion when health reaches 0
            *   ✅ Implemented Debuff System
                *   ✅ Added generic DebuffEffect interface
                *   ✅ Implemented velocity reduction during debuff
                *   ✅ Added debuff application in lion-prey interaction
                *   ✅ Added automatic debuff cleanup
        *   ✅ Natural Prey Movement Behavior
            *   ✅ Added idle states where prey sometimes stand still
            *   ✅ Implemented social behaviors where prey sometimes follow others
            *   ✅ Added varied movement patterns with different speeds and directions
            *   ✅ Integrated new behaviors with existing collision detection and boundary handling
        *   ✅ Health-Based Prey Rendering
            *   ✅ Implemented linear color interpolation between green (healthy) and gray (low health)
            *   ✅ Added health percentage tracking
            *   ✅ Added visual feedback for health changes below 50%
        *   ✅ Carrion Eating Mechanics
            *   ✅ Added food value property to CarrionEntity
            *   ✅ Implemented 10 food consumption per interaction
            *   ✅ Added transparency-based rendering for carrion
            *   ✅ Implemented carrion removal when food reaches 0
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
    *   ✅ Game World V2 Initial Implementation
        *   ✅ Basic Entity System
            *   ✅ Entity Types and States
            *   ✅ Entity Management Functions
        *   ✅ Core Interactions
            *   ✅ Basic Collision Detection
            *   ✅ Distance-based Collision Response
        *   ✅ Basic Behaviors
            *   ✅ Prey Movement with Random Direction
            *   ✅ World Bounds Handling
        *   ✅ Prey Spawning System
            *   ✅ Implemented PreySpawnConfig interface
            *   ✅ Added spawn logic using new entity system
            *   ✅ Integrated with game world update cycle
            *   ✅ Added configurable spawn parameters
            *   ✅ Implemented random position generation
        *   ☐ Advanced Interactions
            *   ☐ Lion-Prey Kill Interaction
            *   ☐ Lion-Carrion Eat Interaction
        *   ☐ Advanced Behaviors
            *   ☐ Lion Movement and Chase
            *   ☐ Improved Prey Group Behavior

## Branch: Interactions
    *   ✅ Lion Targeting System
    *   ✅ Prey Catching and Eating Mechanics
    *   ✅ Debug Catching Mechanics
    *   ✅ Enhanced Catching Mechanics
    *   ✅ Debug Visualization System
        *   ✅ Added prey state debugging
        *   ✅ Added timing constant controls
        *   ✅ Implemented progress indicators
        *   ✅ Enhanced visual feedback

## Branch: Visual Improvements
    *   ☐ Replace simple triangle with proper lion sprite
    *   ☐ Add movement animations
    *   ☐ Implement direction indicators
    *   ☐ Add particle effects for movement
    *   ☐ Visual Feedback for Fleeing
        *   ☐ Add fleeing indicators
        *   ☐ Implement visual stress levels
        *   ☐ Add group fleeing visualization

## Branch: Technical Improvements
    *   ✅ Enhanced Debug System
        *   ✅ Implemented configurable timing constants
        *   ✅ Added detailed state visualization
        *   ✅ Created progress indicators for state transitions
        *   ✅ Added dev panel controls for debugging features
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
    *   Game World V2 Enhancements
        *   Consider implementing entity component system (ECS)
        *   Add support for entity hierarchies
        *   Implement event system for entity interactions
        *   Add spatial partitioning for better performance
        *   Consider adding physics simulation
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
    *   Debug System Enhancement
        *   Add state transition history visualization
        *   Implement timeline view for state changes
        *   Add ability to pause and step through state changes
        *   Create detailed metrics for prey behavior analysis
        *   Add export/import of debug configurations
        *   Implement debug data logging and analysis tools