# Monster Steps - Technical Design Document

## Overview
This document outlines the technical implementation details for the "Monster Steps" game, focusing on a lightweight approach to meet the 13KB size limit of the js13k competition.

## Core Technologies
- Preact app structure
- HTML5 Canvas for rendering the gameplay
- TypeScript for game logic (compiling to minimal JavaScript)
- Minimal CSS for layout and styling

## Project Structure
```
/game
  /dist             # Minified version of the game
  /src
    main.tsx         # Entry point, should render the game states
    global-styles.css # Global styles that ensure we have correct look and feel aligned with the designs
    /game-states    # Each of game states has their dedicated directory
      /intro        # Intro splash screen, transitions to instructions
        intro.tsx
      /instructions # Instructions screen, transitions to game play
        instructions.tsx
      /gameplay     # The main state where the player can actually play the game (transitions to pause, game-over, or level-complete)
        gameplay.tsx # main component of the gameplay, initialises the game, renders the grid canvas, the hud
        gameplay-types.ts # types that represent the state of the gameplay (level, monsters, player, score etc.)
        grid-render.ts # a component to display grid on canvas
        object-render.ts # functions for rendering objects on grid like the player or monsters
        effects-render.ts # functions that render special effects on the canvas
        hud.ts # display HUD for the gameplay
        level-generator.ts # function that generates the level
        monsters.ts # monster logic
      /pause        # Pause screen (transitions to gameplay, or to intro)
        pause.tsx
      /game-over    # Game over screen (transitions to intro or game-play)
        game-over.tsx
      /level-complete # Displayed when player reached the goal (tansitions to gameplay or to intro)
        level-complete.tsx
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
