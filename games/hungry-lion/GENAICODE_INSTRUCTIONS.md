# INSTRUCTIONS FOR GENAICODE

This file contains instructions for Genaicode on how to work with this project source code.

## Core Development Principles

### The first and most important instruction
Feel free to update these instructions if you think it can help to continue the project.

### Keep files small and focused
Large and long files are not desired, they make life of programmer harder. LLMs also do not prefer large files with many responsibilities.

### Demand well defined tasks
Feel free to ask questions, and expect better defined tasks.

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

Remember: Documentation is as important as code. Every code change should be reflected in the project's documentation to maintain clarity and facilitate future development.