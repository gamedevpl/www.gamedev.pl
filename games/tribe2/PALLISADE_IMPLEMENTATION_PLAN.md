# Palisade and Gate System Implementation Plan

## 1. Overview
Introduce **Palisades** (walls) and **Gates** to allow tribes to secure their infrastructure. The system uses a **Modular Gord** strategy for AI placement and an optimized **Toroidal A*** pathfinder for navigation.

---

## 2. Data Model & Constants

### Building Definitions (`src/game/entities/buildings/building-consts.ts`)
- **Palisade**: Cheap (e.g., 1 wood), high hitpoints, blocks all movement.
- **Gate**: Moderate cost (e.g., 3 wood), allows passage *only* for members of the owner's tribe.
- **Dimensions**: 20x20px (matching the territory grid resolution).

### Entity Types (`src/game/entities/buildings/building-types.ts`)
- Update `BuildingType` enum.
- Add `ownerId` check to gate logic during collision/pathfinding.

---

## 3. Strategic AI: The "Modular Gord" Approach

### Gord Formation Logic
Instead of walling the entire territory, tribes build fortified enclosures (Gords) around critical infrastructure.
1.  **Hub Identification**: The AI selects a `Bonfire` or `StorageSpot` as a Gord seed.
2.  **Perimeter Planning**: Plans a square/rectangular perimeter (e.g., 5-8 tiles radius) around the hub.
3.  **Constraint Handling**:
    *   If a planned segment overlaps an existing wall/building, skip it.
    *   If a segment is blocked by a **Tree**, the AI produces a `HumanChopTree` task with high priority for that specific tree.
4.  **Modular Expansion**: When a new hub is built outside existing Gords, a new enclosure is planned. If perimeters are close, they are merged into a single larger Gord.

### Gate Placement
- At least one segment in every Gord is designated as a `Gate`.
- **Primary Gate**: Placed on the side closest to the tribe's nearest resource cluster (e.g., Berry Bushes).
- **Secondary Gate**: Placed on the side facing the tribe center or other Gords.

---

## 4. Navigation & Pathfinding

### Navigation Grid (`src/game/utils/navigation-utils.ts`)
- **Resolution**: 20px (matches territory grid).
- **Static Obstacles**: Palisades, Standing Trees, and (future) Water.
- **Dynamic Obstacles**: Gates (Walkable only for tribe members).

### Toroidal A* Implementation
- Implements A* search that accounts for world wrapping.
- **Optimization**:
    *   **Path Caching**: Entities cache their paths; recalculation only happens if the target moves or an obstacle is placed on the current path.
    *   **Throttling**: Pathfinding requests are queued and processed (e.g., max 5-10 per frame) to maintain 60 FPS with 1000+ units.

---

## 5. AI Tasks & Behaviors

### New Tasks (`src/game/ai/task/task-types.ts`)
- `HumanPlacePalisade`: Construction task for wall segments.
- `HumanPlaceGate`: Construction task for gates.
- `HumanAttackBuilding`: Task for breaching enemy palisades/gates.

### Task Producers
- **Tribe Level**: The leader produces placement tasks based on the Gord plan.
- **Breaching**: If a human's path to a high-priority target (food/enemy) is blocked by a wall and no valid path exists within a reasonable distance, they generate a `HumanAttackBuilding` task for the obstructing segment.

---

## 6. Movement Integration

### `HumanMovingState` Update
- Entities check if their direct path is blocked by a Palisade or an enemy Gate.
- If blocked, they switch from "Greedy Steering" to "Path Following" using the A* result.
- Once the obstacle is cleared, they return to efficient steering.

---

## 7. Rendering (`src/game/render/render-building.ts`)

- **Visuals**: Palisades rendered as sharpened wooden logs or stone blocks.
- **Tribe Branding**: Wall accents use the `tribeColor`.
- **Connectivity**: Adjacent segments of the same tribe visually "snap" together to form a continuous barrier.
- **Damage Feedback**: Visual cracks and missing segments as hitpoints decrease.

---

## 8. Implementation Steps

1.  **Phase 1: Foundations**
    *   Define `Palisade` and `Gate` in constants and types.
    *   Add `HumanPlacePalisade`, `HumanPlaceGate`, and `HumanAttackBuilding` to `TaskType`.
2.  **Phase 2: Navigation**
    *   Implement `NavigationGrid` and Toroidal A*.
    *   Update `HumanMovingState` to support path following.
3.  **Phase 3: AI Logic**
    *   Implement Gord planning algorithm in `tribe-building-task-producer.ts`.
    *   Implement `HumanAttackBuilding` executor.
4.  **Phase 4: Visuals**
    *   Implement specialized rendering for Palisades and Gates.
    *   Add connection logic for continuous walls.
