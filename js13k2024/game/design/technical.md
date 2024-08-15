# Monster Steps - Technical Design Document

## Overview
This document outlines the technical implementation details for the "Monster Steps" game, focusing on a lightweight approach to meet the 13KB size limit of the js13k competition.

## Core Technologies
- Preact app structure
- HTML5 Canvas for rendering the main game
- TypeScript for game logic (compiling to minimal JavaScript)
- Minimal CSS for layout and styling

## Project Structure
```
/game
  /dist             # Minified version of the game
  /src
    main.ts         # Entry point, should render the first game state (intro)   
    /utils
    /game-states    # Each of game states has their dedicated directory
      /intro        # Intro splash screen, transitions to instructions
      /instructions # Instructions screen, transitions to game play
      /gameplay     # The main state where the player can actually play the game (transitions to pause, game-over, or level-complete)
      /pause        # Pause screen (transitions to gameplay, or to intro)
      /game-over    # Game over screen (transitions to intro or game-play)
      /level-complete # Displayed when player reached the goal (tansitions to gameplay or to intro)
  index.html        # Main HTML file
  styles.css        # Minimal CSS for layout
  README.md         # Short readme with info about the project and how tun develop/build
  package.jon       # package.json file
  tsconfig.json     # TypeScript configuration file
```

## Optimization Techniques

1. **Minification**: Use a minifier to reduce code size.
2. **Sprite Sheets**: If using images, combine them into a single sprite sheet.
3. **Procedural Generation**: Generate levels procedurally to save space.
4. **Simplified Physics**: Use basic collision detection instead of complex physics.
5. **Reusable Functions**: Create utility functions for common operations.
6. **Efficient Data Structures**: Use typed arrays for performance and memory efficiency.

## Performance Considerations

1. **Object Pooling**: Reuse object instances to reduce garbage collection.
2. **Minimal DOM Manipulation**: Update game state in memory, render to canvas.
3. **Efficient Loops**: Optimize loops for performance, especially in the game loop.
4. **Caching**: Cache frequently used values and DOM references.

