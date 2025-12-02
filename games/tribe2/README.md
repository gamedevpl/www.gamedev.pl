# Tribe2

**Tribe2** is a settlement management game where you lead a tribe by planning building placements while AI-controlled tribe members handle the execution.

## Game Concept

Unlike Tribe1 where you control a single character, in Tribe2 you take on the strategic role of a tribe leader. Your responsibility is to plan where buildings should be placed, and your tribe members will handle everything else - from gathering resources to constructing buildings.

## Development Status

🚧 **Work In Progress** - Currently establishing the baseline foundation.

### Current Features
- World rendering with Canvas 2D
- Terrain system with height, biomes, and water
- Base entity and AI systems from Tribe1
- Toroidal world (wrapping at edges)

### Planned Features
See [GAME_DESIGN.md](./GAME_DESIGN.md) for the complete design document, including:
- Building placement system
- Resource management and production chains
- Job assignment and professions
- Family dynamics and tribe management

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npm start
   ```

3. Open your browser and navigate to the displayed local URL.

## Project Structure

- `src/components/` – UI components
- `src/game/` – Core game logic and mechanics
  - `game/entities/` – Entity types (humans, animals, plants)
  - `game/ai/` – AI behavior trees
  - `game/render/` – Canvas 2D rendering
  - `game/sound/` – Sound system
- `src/context/` – React context for state management

## Contributing

This is part of the Gamedev.pl open source initiative. See [GAME_DESIGN.md](./GAME_DESIGN.md) for the design vision.
