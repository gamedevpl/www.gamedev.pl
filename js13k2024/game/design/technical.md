# Monster Steps - Technical Design Document

## Overview
This document outlines the technical implementation details for the "Monster Steps" game, focusing on a lightweight approach to meet the 13KB size limit of the js13k competition.

## Core Technologies
- Preact for app structure and component management
- HTML5 Canvas for rendering the gameplay
- TypeScript for game logic (compiling to minimal JavaScript)
- Minimal CSS for layout and styling

## Project Structure
```
/game
  /dist             # Minified version of the game
  /src
    main.tsx         # Entry point, manages game states and main app structure
    global-styles.css # Global styles for consistent look and feel
    /game-states    # Each game state has a dedicated directory
      /intro
        intro.tsx
      /instructions
        instructions.tsx
      /gameplay
        gameplay.tsx # Main component of the gameplay
        gameplay-types.ts # Types for gameplay state
        game-logic.ts # Core game logic implementation
        grid-render.ts # Canvas rendering for the game grid
        object-render.ts # Rendering functions for game objects
        effects-render.ts # Special effects rendering
        hud.ts # Heads-up display rendering
        level-generator.ts # Deterministic level generation
        monster-logic.ts # Monster behavior implementation
      /pause
        pause.tsx
      /game-over
        game-over.tsx
      /level-complete
        level-complete.tsx
      /game-complete
        game-complete.tsx
  index.html        # Main HTML file
  styles.css        # Minimal CSS for layout
  README.md         # Project information and development instructions
  package.json      # Project dependencies and scripts
  tsconfig.json     # TypeScript configuration
```

## Key Technical Components

### 1. Deterministic Level Generation
- Implemented in `level-generator.ts`
- Each level (1-13) has a predefined generation function
- Levels are created with specific layouts, obstacles, monsters, and bonuses
- Ensures consistent gameplay experience across sessions

### 2. Game State Management
- Uses Preact's state management to handle different game states
- Main states: Intro, Instructions, Gameplay, Pause, Game Over, Level Complete, Game Complete
- State transitions managed in `main.tsx`

### 3. Gameplay Logic
- Core game mechanics implemented in `game-logic.ts`
- Handles player movement, collision detection, bonus activation, and monster behavior
- Uses a step-based system for game progression

### 4. Bonus System
- Various bonus types implemented: Cap of Invisibility, Confused Monsters, Land Mine, Time Bomb, Crusher, Builder
- Bonuses are represented as objects with type and duration properties
- Bonus effects are applied in the game logic based on active bonuses

### 5. Monster AI
- Basic pathfinding for monsters implemented in `monster-logic.ts`
- Monsters follow predetermined paths or behaviors based on level design
- Special behaviors (e.g., confusion) handled by modifying monster movement patterns

### 6. Rendering
- Uses HTML5 Canvas for efficient rendering
- Separate rendering functions for grid, objects, and effects
- HUD elements rendered using a combination of Canvas and HTML/CSS

### 7. Input Handling
- Keyboard input for player movement and game control
- Event listeners set up in `main.tsx` and `gameplay.tsx`

## Optimization Techniques

1. **Code Minification**: Use a minifier to reduce JavaScript and CSS file sizes
2. **Asset Optimization**: Minimize use of images, favor programmatic generation of visual elements
3. **Efficient Data Structures**: Use simple arrays and objects to represent game state
4. **Reusable Functions**: Create utility functions for common operations to reduce code duplication
5. **Preact for Size Efficiency**: Utilize Preact's small footprint for component management
6. **Canvas Performance**: Optimize canvas rendering by minimizing draw calls and using appropriate data types

## Bonus Implementation Details

1. **Cap of Invisibility**: Modifies monster behavior to ignore player
2. **Confused Monsters**: Alters monster pathfinding algorithm
3. **Land Mine**: Adds object to game grid, checks for monster collision
4. **Time Bomb**: Implements countdown and area effect destruction
5. **Crusher**: Modifies collision detection to allow obstacle destruction
6. **Builder**: Allows player to add new obstacles to the game grid

## Level Progression

- Levels are accessed sequentially from 1 to 13
- Each level increase introduces new challenges or combinations of game elements
- Level data is generated on-demand to save memory

## Performance Considerations

1. **Efficient State Updates**: Minimize state changes and re-renders
2. **Canvas Optimization**: Use layered canvases for static and dynamic elements
3. **Event Delegation**: Implement efficient event handling to reduce listener count
4. **Memory Management**: Properly dispose of unused objects and clear unnecessary timers

## Accessibility and Responsiveness

1. **Keyboard Controls**: Ensure full keyboard navigation support
2. **Responsive Design**: Use relative units and flexible layouts for various screen sizes
3. **Color Contrast**: Implement high contrast mode for better visibility

This technical design focuses on creating a lightweight, efficient implementation of "Monster Steps" that fits within the 13KB size limit while providing engaging gameplay. The use of Preact, Canvas rendering, and optimized JavaScript allows for a rich gaming experience despite the size constraints.