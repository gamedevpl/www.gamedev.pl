# INSTRUCTIONS FOR GENAICODE (Simplified - Software Engineering Focus)

This file contains simplified instructions for Genaicode, focusing on software engineering principles for this project.

## Core Development Principles

### The first and most important instruction
Feel free to update these instructions if you think it can help to improve the project workflow.

### Keep files small and focused
Large files are harder to manage and understand. Aim for small, focused files with clear responsibilities. This is beneficial for both human developers and LLMs.

### Demand well defined tasks
Clarity is key. Ask for more details and better-defined tasks when needed.

### Create new modules for specific functionalities
For new features or functionalities, create new, dedicated modules. This promotes modularity, clarity, and maintainability.

## Documentation Requirements

### Documentation Updates with Code Changes
Every code change requires corresponding documentation updates:
1. Update GENAICODE_TRACKER.md to reflect changes:
   - List completed tasks
   - Describe implementation modifications
   - Note future task considerations
2. Update GENAICODE_INSTRUCTIONS.md to improve guidance:
   - Add new development patterns (general software principles)
   - Identify better practices
   - Clarify existing instructions

### Feature Implementation Documentation
When implementing new features:
1. Document the feature in GENAICODE_TRACKER.md:
   - List all affected files
   - Describe core functionality
   - Note any technical decisions
2. Add implementation notes:
   - Document complex algorithms
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
1. Review existing documentation (GENAICODE_TRACKER.md, GENAICODE_INSTRUCTIONS.md)
2. Analyze task requirements
3. Plan necessary documentation updates
4. Identify affected components

### During Implementation
1. Write clear, focused code
2. Update documentation in parallel
3. Note any discovered tasks in GENAICODE_TRACKER.md
4. Document technical decisions in GENAICODE_TRACKER.md

### After Implementation
1. Review documentation completeness
2. Update task tracking in GENAICODE_TRACKER.md
3. Add future considerations to GENAICODE_TRACKER.md
4. Document lessons learned in GENAICODE_TRACKER.md (optional, but helpful for reflection)

## Code Organization

### File Structure
1. Keep files small and focused
2. Group related functionality within modules
3. Maintain clear dependencies between modules
4. Document file and module purposes (briefly in comments or README within module if needed)

### Code Layout
1. Place main exports first in each file:
   - Primary exported functions/components at the top
   - Helper functions after main exports
   - Types and interfaces near their usage, ideally at the end of the file or before their first usage if it improves readability.
2. Keep code self-explanatory:
   - Minimize comments by writing clear and descriptive code
   - Use clear, descriptive names for variables, functions, and modules
   - Only comment complex logic or non-obvious implementations
3. Organize imports:
   - Group related imports together
   - External dependencies first
   - Internal modules second
   - Types and interfaces last

### Code Quality
1. Write maintainable code that is easy to understand and modify.
2. Include necessary comments for clarity where code is not self-explanatory.
3. Use consistent coding patterns throughout the project.
4. Follow existing conventions and code style within the project.

## Best Practices

### Documentation First (or Concurrent)
- Update documentation before or in parallel with code changes.
- Keep documentation consistently in sync with the code.
- Use clear, consistent formatting in documentation.

### Clear Communication
- Ask questions when you are unsure or need clarification.
- Document assumptions made during implementation.
- Explain complex decisions in the documentation.

### Quality Focus
- Maintain high code quality.
- Keep documentation comprehensive and up-to-date.
- Follow established patterns and principles for maintainability and scalability.

Remember: Documentation is as important as code. Every code change should be reflected in the project's documentation to maintain clarity and facilitate future development.