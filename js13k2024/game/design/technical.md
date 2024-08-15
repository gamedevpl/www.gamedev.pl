# Monster Steps - Technical Design Document

## Overview
This document outlines the technical implementation details for the "Monster Steps" game, focusing on a lightweight approach to meet the 13KB size limit of the js13k competition.

## Core Technologies
- HTML5 Canvas for rendering
- TypeScript for game logic (compiling to minimal JavaScript)
- Minimal CSS for layout and styling

## Project Structure
```
/game
  /dist             # Minified version of the game
  /src
    main.ts         # Entry point and game loop    
    renderer.ts     # Canvas rendering
    input.ts        # Input handling
    constants.ts    # Game constants and configurations
    /game-states    # Each of game states has their dedicated directory
      /intro        # Intro splash screen
      /instructions # Instructions screen
      /gameplay     # The main state where the player can actually play
      /pause        # Pause screen
      /game-over    # Game over screen
      /level-complete # Displayed when player reached the goal
  index.html        # Main HTML file
  styles.css        # Minimal CSS for layout
  README.md         # Short readme with info about the project and how tun develop/build
  package.jon       # package.json file
  tsconfig.json     # TypeScript configuration file
```

## Game Loop
Implement a simple game loop using `requestAnimationFrame`:

```typescript
// In main.ts
function gameLoop(timestamp: number) {
  update(timestamp);
  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

## Rendering Approach
Use a single canvas element for rendering all game elements:

```typescript
// In renderer.ts
class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  drawGrid(grid: number[][]) {
    // Implementation for drawing the grid
  }

  drawPlayer(x: number, y: number) {
    // Draw player as a green circle
  }

  drawMonster(x: number, y: number) {
    // Draw monster as a purple square
  }

  drawUI(stepCount: number, score: number) {
    // Draw UI elements
  }
}
```

## Input Handling
Use event listeners for keyboard input:

```typescript
// In input.ts
enum Direction { Up, Down, Left, Right }

class InputHandler {
  private keyState: { [key: string]: boolean } = {};

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private handleKeyDown(e: KeyboardEvent) {
    this.keyState[e.key] = true;
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keyState[e.key] = false;
  }

  getDirection(): Direction | null {
    // Return direction based on keyState
  }
}
```

## Data Structures

### Game State
```typescript
// In game.ts
interface GameState {
  grid: number[][];
  playerPosition: { x: number, y: number };
  monsters: { x: number, y: number }[];
  stepCount: number;
  score: number;
}
```

### Level Definition
```typescript
// In levels.ts
interface Level {
  grid: number[][];
  startPosition: { x: number, y: number };
  goalPosition: { x: number, y: number };
}

const levels: Level[] = [
  // Define levels here
];
```

## Game Logic

### Player Movement
```typescript
// In game.ts
function movePlayer(direction: Direction) {
  // Update player position
  // Check for collisions
  // Update step count
  // Check for monster spawning
}
```

### Monster Behavior
```typescript
// In game.ts
function updateMonsters() {
  // Move each monster towards the player's previous position
}
```

### Collision Detection
```typescript
// In game.ts
function checkCollision(x: number, y: number): boolean {
  // Check if position is within grid and not an obstacle
}
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

## Responsive Design
Implement a simple scaling system to fit different screen sizes:

```typescript
// In renderer.ts
function resizeCanvas() {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const aspectRatio = 16 / 9;
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;
  
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

window.addEventListener('resize', resizeCanvas);
```

## Conclusion
This technical design focuses on creating a lightweight, efficient implementation of "Monster Steps" that meets the 13KB size limit. By using TypeScript for strong typing and organization, and focusing on minimal, efficient code, we can create an engaging game experience within the constraints of the js13k competition.