# INSTRUCTIONS FOR GENAICODE

This file contains instructions for Genaicode on how to work with this project source code.

## Core Development Principles

### The first and most important instruction
Feel free to update these instructions if you think it can help to continue the project.

### Keep files small and focused
Large and long files are not desired, they make life of programmer harder. LLMs also do not prefer large files with many responsibilities.

### Demand well defined tasks
Feel free to ask questions, and expect better defined tasks.

### Create new modules for specific functionalities
When adding new features or functionalities, create new modules specifically for them. This helps maintain modularity, clarity, and makes the codebase easier to manage and extend.

## Documentation Requirements

### Documentation Updates with Code Changes
Every code change must be accompanied by appropriate documentation updates:
1. Update GENAICODE_TRACKER.md with:
   - New completed tasks
   - Modified implementation details
   - Future task considerations
2. Update GENAICODE_INSTRUCTIONS.md when:
   - Adding new development patterns
   - Identifying better practices
   - Clarifying existing instructions

### Feature Implementation Documentation
When implementing new features:
1. Document the feature in GENAICODE_TRACKER.md:
   - List all affected files
   - Describe core functionality
   - Note any technical decisions
2. Add implementation notes:
   - Document any complex algorithms
   - Explain architectural decisions
   - List potential future improvements

### Code Documentation Standards
1. Include clear comments for:
   - Complex logic
   - Non-obvious implementations
   - Public interfaces
2. Maintain type definitions:
   - Keep types up to date
   - Document type parameters
   - Explain complex type relationships

## Feature Tracking Guidelines

### Task Management
1. Always update GENAICODE_TRACKER.md:
   - Mark completed tasks
   - Add new discovered tasks
   - Update task dependencies
2. Maintain task categorization:
   - Group related tasks
   - Track dependencies
   - Note implementation status

### Implementation Progress
1. Track changes in logical groups:
   - List related file changes
   - Document API modifications
   - Note affected systems
2. Monitor future considerations:
   - Keep track of TODOs
   - List potential improvements
   - Note optimization opportunities

## Development Process

### Before Implementation
1. Review existing documentation
2. Analyze task requirements
3. Plan necessary documentation updates
4. Identify affected components

### During Implementation
1. Write clear, focused code
2. Update documentation in parallel
3. Note any discovered tasks
4. Document technical decisions

### After Implementation
1. Review documentation completeness
2. Update task tracking
3. Add future considerations
4. Document lessons learned

## Code Organization

### File Structure
1. Keep files small and focused
2. Group related functionality
3. Maintain clear dependencies
4. Document file purposes

### Code Layout
1. Place main exports first
   - Main exported functions/components at the top
   - Helper functions after main exports
   - Types and interfaces near their usage
2. Keep code self-explanatory
   - Minimize comments, let code speak for itself
   - Use clear, descriptive names
   - Only comment complex logic or non-obvious implementations
3. Organize imports
   - Group related imports together
   - External dependencies first
   - Internal modules second
   - Types and interfaces last

### Code Quality
1. Write maintainable code
2. Include necessary comments
3. Use consistent patterns
4. Follow existing conventions

## Best Practices

### Documentation First
- Update documentation before code changes
- Keep documentation in sync with code
- Use clear, consistent formatting

### Clear Communication
- Ask questions when needed
- Document assumptions
- Explain complex decisions

### Quality Focus
- Maintain code quality
- Keep documentation updated
- Follow established patterns

## New Development Patterns

### Timing Mechanics
When implementing timing mechanics (e.g., prey-to-carrion conversion, eating process):
1. Define timing constants in a central location (e.g., `prey-types.ts`)
2. Use timestamps to track the start of processes
3. Update state transitions based on elapsed time
4. Ensure consistent timing across different game states

### Prey Behavior and Rendering
When implementing prey behavior and rendering:
1. Ensure that prey which became carrion and is being eaten does not move
2. Provide distinct visual representation for carrion
3. Maintain consistency between behavior and rendering logic

### Angle-Based Behavior Logic
When implementing behavior logic that considers angles (e.g., prey fleeing behavior):
1. Define angle thresholds as constants for clarity and maintainability
2. Use vector math utilities to calculate angles between entities
3. Adjust behavior parameters (e.g., detection distance) based on calculated angles
4. Ensure smooth transitions between different behavior states based on angle thresholds

### Carrion Rendering Patterns
When implementing carrion rendering:
1. Use a distinct gray color (#808080) for carrion entities
2. Render simple line crosses on carrion entities
3. Maintain the same body shape as prey but with different visual indicators
4. Ensure carrion rendering is consistent with game's visual style
5. Keep rendering logic separate from behavior logic

### Health-Based Rendering Patterns
When implementing health-based rendering:
1. Use linear interpolation between colors based on health percentage
2. Start visual changes below 50% health
3. Maintain consistent visual feedback for health changes
4. Ensure rendering updates are performance efficient

### Interaction Mechanics
When implementing interaction mechanics:
1. Define clear interaction ranges and parameters
2. Use state-based interaction handling
3. Implement visual feedback for interactions
4. Ensure smooth state transitions during interactions

### Action Bar Mechanics
When implementing action bar mechanics:
1. Maintain clear state management:
   - Track enabled/disabled state for each action
   - Update visual feedback based on state
   - Handle state transitions appropriately
2. Implement proper event handling:
   - Toggle actions through dedicated events
   - Update game state based on action states
   - Clear targets when actions are disabled
3. Ensure proper state machine integration:
   - Check action states before state transitions
   - Return to idle state when actions are disabled
   - Maintain consistency between UI and game state

### Natural Prey Movement Patterns
When implementing natural prey movement:
1. Implement idle states with configurable probabilities
2. Add social behaviors with configurable following probabilities
3. Use varied movement patterns with different speeds and directions
4. Ensure smooth integration with existing collision detection and boundary handling
5. Maintain clear state transitions between different behaviors

### Ambush State Mechanics
When implementing ambush state and mechanics:
1. State Implementation:
   - Create dedicated state file for ambush mechanics
   - Implement no movement logic during ambush
   - Handle proper state transitions
   - Include speed boost flag in state data

2. Speed Boost Implementation:
   - Define separate constants for normal and boosted speeds
   - Implement boost duration with proper timing
   - Handle boost expiration gracefully
   - Ensure smooth acceleration transitions

3. Action Management:
   - Make ambush action mutually exclusive with others
   - Clear other actions when enabling ambush
   - Handle proper state cleanup on action toggle
   - Maintain clear action state transitions

4. State Transitions:
   - Handle transitions between all relevant states
   - Implement proper boost timing on state change
   - Clear boost effects when appropriate
   - Maintain state consistency during transitions

5. Game Balance:
   - Configure appropriate boost values
   - Set reasonable boost duration
   - Balance risk/reward of ambush state
   - Consider prey behavior modifications

Remember: Documentation is as important as code. Every code change should be reflected in the project's documentation to maintain clarity and facilitate future development.
### Debuff Mechanics Pattern
When implementing temporary effects on entities (debuffs):

1. Debuff Definition:
   - Use the `DebuffEffect` interface to define temporary effects
   - Include start time and duration properties
   - Consider the effect type and strength

2. Application Guidelines:
   - Apply debuffs through interaction definitions
   - Set appropriate duration based on game balance
   - Consider frame-rate independence for timing

3. Processing and Cleanup:
   - Check and process debuffs in entity update
   - Apply effects consistently across all entity types
   - Automatically clear expired debuffs
   - Reset affected properties when debuff expires
