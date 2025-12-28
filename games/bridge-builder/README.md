# Bridge Builder

A physics-based bridge building game where you must construct a bridge strong enough to survive a train crossing!

![Bridge Builder Gameplay](./media/bridge-builder-gameplay-small.gif)

## Game Description

Bridge Builder is a puzzle/engineering game where players design and build bridges using different materials (wood, steel, and road) while managing a limited budget. The goal is to create a structure that can support a train consisting of 3 cars as it crosses from one platform to another.

## Features

- **Physics-based simulation** using planck-js physics engine
- **Multiple materials**: Wood (cheap, weak), Steel (expensive, strong), Road (for train wheels)
- **Budget management**: Build within your budget constraints
- **Real-time testing**: Watch your bridge in action as the train crosses
- **Pixel art graphics**: Retro-style visuals with smooth physics

## How to Play

1. **Build Mode**:
   - Click on empty space to place nodes (connection points)
   - Click a node, then another node to connect them with a beam
   - Select material type (Wood, Steel, Road) before connecting
   - Use the Delete tool to remove unwanted beams or nodes

2. **Materials**:
   - **Wood**: Cheapest option but breaks easily under stress
   - **Steel**: Most durable but expensive
   - **Road**: Creates a physical track for train wheels to roll on (required!)

3. **Tips**:
   - Use triangular structures for maximum strength
   - Road beams must form a continuous path for the train
   - Long unsupported spans will collapse under the train's weight

4. **Testing**:
   - Click "Play Test" to run the simulation
   - The train will attempt to cross your bridge
   - If the bridge collapses, go back and reinforce it!

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

## Technical Details

- Built with React + TypeScript
- Physics powered by planck-js (Box2D port)
- Styled with styled-components
- Bundled with Vite

## Credits

Created by [gtanczyk](https://github.com/gtanczyk) for [gamedev.pl](https://www.gamedev.pl)
