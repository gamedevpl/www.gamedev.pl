# Planet-like Recursive World Design

## 1. Introduction

This document outlines the design and implementation plan for the "Planet-like Recursive World" feature in the Hungry Lion game. The goal is to create a game world that feels continuous, allowing players to move indefinitely in one direction and seamlessly wrap around to the opposite side, simulating the surface of a planet.

## 2. Concept

The core idea is to eliminate hard boundaries in the game world. Instead of stopping or teleporting when reaching an edge, entities (especially the player-controlled lion) should experience seamless wrapping.

-   **Continuous Movement:** Entities can move past the defined world dimensions (e.g., `GAME_WORLD_WIDTH`, `GAME_WORLD_HEIGHT`).
-   **Seamless Visual Wrapping:** There should be no jarring visual jump or teleportation. As an entity approaches an edge (e.g., the right edge), the environment and entities from the opposite edge (e.g., the left edge) should become visible, creating the illusion of a continuous, connected space.
-   **Distinction from Asteroids-style Wrap:** Unlike simple teleportation where an entity disappears from one side and instantly reappears on the other, this approach focuses on rendering the adjacent "wrapped" area to maintain visual continuity.

## 3. Technical Implementation Plan

### 3.1 Entity Position Updates (Mathematical Wrapping)

-   **Mechanism:** Use the modulo operator (`%`) to constrain entity coordinates within the world boundaries after each movement update.
-   **Affected Files:**
    -   `src/screens/play/game-world/entities/entity-update.ts`
-   **Details:** Modify the position update logic:
    ```typescript
    // Inside entityUpdate function after calculating the new position
    entity.position.x = ((entity.position.x + deltaX) % GAME_WORLD_WIDTH + GAME_WORLD_WIDTH) % GAME_WORLD_WIDTH;
    entity.position.y = ((entity.position.y + deltaY) % GAME_WORLD_HEIGHT + GAME_WORLD_HEIGHT) % GAME_WORLD_HEIGHT;
    ```
    *(Note: Using `(val % N + N) % N` ensures a positive result for the modulo operation, which is necessary as JavaScript's `%` can return negative values)*.

### 3.2 Rendering (Seamless Visual Wrapping)

-   **Mechanism:** Render entities and environment elements multiple times when they are near the viewport edges, offsetting their positions by the world dimensions to simulate continuity.
-   **Affected Files:**
    -   `src/screens/play/game-render/game-renderer.ts`: Modify the main render loop to handle potential multiple draw calls for entities based on their proximity to wrapped boundaries relative to the viewport.
    -   `src/screens/play/game-render/entity-renderers/` (all files: `lion-renderer.ts`, `prey-renderer.ts`, `hunter-renderer.ts`, `carrion-renderer.ts`): Potentially adjust drawing logic if helper functions are needed, or handle multiple draws within `game-renderer.ts`.
    -   `src/screens/play/game-render/environment-renderer.ts`: Modify to draw environment sectors (grass, water) with offsets if they cross viewport edges due to wrapping.
    -   `src/screens/play/game-render/ground-renderer.ts`: Modify `drawGround` to handle drawing the cached ground texture with offsets to cover wrapped areas visible in the viewport.
-   **Details:** The core idea is to check if an object's visual representation would span across a world boundary *within the current viewport*. If so, draw it once at its calculated position and again at the offset position(s) (e.g., `x + worldWidth`, `x - worldWidth`, `y + worldHeight`, `y - worldHeight`, and potentially diagonal combinations like `x + worldWidth, y + worldHeight`).

### 3.3 Viewport/Camera

-   **Mechanism:** The existing viewport logic in `render-state.ts` that centers the view on the player should remain largely unchanged. The visual wrapping effect is achieved purely through the rendering logic modifications described above.
-   **Affected Files:**
    -   `src/screens/play/game-render/render-state.ts`: Review to ensure viewport calculations don't conflict with wrapping logic, but significant changes are not anticipated.

### 3.4 Interactions (Wrapped Distance Calculations)

-   **Mechanism:** Update distance calculation functions to account for the shortest path in a wrapped world. Interactions based on proximity (targeting, collision detection, fleeing triggers) must use this wrapped distance.
-   **Affected Files:**
    -   `src/screens/play/game-world/utils/math-utils.ts`: Introduce a new function, e.g., `calculateWrappedDistance(pos1, pos2)`, that calculates the shortest distance considering world wrapping.
    -   `src/screens/play/game-world/interactions/definitions/` (relevant files like `lion-prey-interaction.ts`, `hunter-lion-interaction.ts`, etc.): Update interaction checkers to use `calculateWrappedDistance` instead of standard distance functions.
    -   State machine logic (e.g., `prey-fleeing-state.ts`, `lion-chasing-state.ts`): Update any distance checks within state logic to use the wrapped distance.
-   **Details:** The `calculateWrappedDistance` function will compare the direct distance `dx = x1 - x2` with the wrapped distance `dx_wrapped = worldWidth - abs(dx)` and use the smaller absolute value for both X and Y axes before calculating the final Euclidean distance.

## 4. Affected Files Summary

-   `src/screens/play/game-world/entities/entity-update.ts`
-   `src/screens/play/game-render/game-renderer.ts`
-   `src/screens/play/game-render/entity-renderers/lion-renderer.ts`
-   `src/screens/play/game-render/entity-renderers/prey-renderer.ts`
-   `src/screens/play/game-render/entity-renderers/hunter-renderer.ts`
-   `src/screens/play/game-render/entity-renderers/carrion-renderer.ts`
-   `src/screens/play/game-render/environment-renderer.ts`
-   `src/screens/play/game-render/ground-renderer.ts`
-   `src/screens/play/game-world/utils/math-utils.ts`
-   `src/screens/play/game-world/interactions/definitions/*` (Specific interaction files)
-   `src/screens/play/game-world/state-machine/states/*` (Specific state files with distance checks)
-   `GENAICODE_TRACKER.md` (Manual update required after implementation)

## 5. Future Considerations

-   **Pathfinding:** Implementing pathfinding algorithms (e.g., A*) in a wrapped world requires modifications to neighbor finding and heuristic calculations.
-   **Performance:** Rendering multiple instances of entities/environment near edges might impact performance. Optimization techniques (e.g., culling off-screen wrapped instances) might be needed.
