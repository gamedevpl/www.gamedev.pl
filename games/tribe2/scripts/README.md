# Game Simulation Scripts

This directory contains scripts for running the Tribe2 game simulation in a headless mode, allowing automated gameplay and strategy development.

## Quick Start

### Running the Simulation

```bash
cd games/tribe2

# Option 1: Using npm script
npm run simulate

# Option 2: Using the wrapper script directly
bash scripts/run-simulation.sh

# Option 3: Using Node with custom loader
NODE_OPTIONS="--loader ./scripts/mp3-loader.mjs --no-warnings" npx tsx scripts/simulate.ts
```

### Interactive Player

```bash
npm run play
```

This starts an interactive session where you can type commands to control the game.

### Running the Example AI Strategy

```bash
NODE_OPTIONS="--loader ./scripts/mp3-loader.mjs --no-warnings" npx tsx scripts/strategy-example.ts
```

This runs an automated AI that:
- Gathers food when hungry
- Plants bushes when it has excess food
- Procreates when well-fed
- Explores the map when idle

Watch the stderr output to see the strategy's decision-making process!

## Scripts

### `simulate.ts` - Headless Game Simulation

The main simulation script that runs the game without a UI. It accepts commands via stdin and outputs game state to stdout.

**Usage:**
```bash
npx tsx scripts/simulate.ts
```

**Communication:**
- **stdin**: Send commands as JSON (one per line)
- **stdout**: Receives game state and responses as JSON
- **stderr**: Debug/logging information

**Available Commands:**

```json
{"command": "status"}
```
Get current game state including player position, health, hunger, and population counts. The response includes all humans and their positions, which you can use to find potential partners or targets.

**Note:** The simulation currently doesn't expose berry bush entities or prey/predator entities in the status response. To implement a complete strategy, you would need to enhance the status output to include these entities with their positions and IDs.

```json
{"command": "move", "x": 100, "y": 200}
```
Move the player character to the specified position.

```json
{"command": "gather", "entityId": 123}
```
Gather food from a berry bush (specify the bush's entity ID).

```json
{"command": "attack", "entityId": 456}
```
Attack an entity (prey, predator, or hostile human).

```json
{"command": "plant", "x": 100, "y": 200}
```
Plant a berry bush at the specified position (requires 5 berries in inventory).

```json
{"command": "procreate", "entityId": 789}
```
Initiate procreation with another human entity.

```json
{"command": "pause"}
```
Pause the game simulation.

```json
{"command": "resume"}
```
Resume the game simulation.

```json
{"command": "quit"}
```
Shut down the simulation.

### `play.ts` - Interactive Game Player

An interactive wrapper around the simulation that provides a command-line interface for playing the game.

**Usage:**
```bash
npx tsx scripts/play.ts
```

This will start the simulation in the background and provide an interactive prompt where you can type commands.

**Interactive Commands:**
- `status` - Get current game state
- `move <x> <y>` - Move to position
- `gather <entityId>` - Gather from bush
- `attack <entityId>` - Attack entity
- `plant <x> <y>` - Plant bush
- `procreate <entityId>` - Procreate with human
- `pause` - Pause simulation
- `resume` - Resume simulation
- `strategy` - Run automated strategy
- `quit` - Exit

## Game State Format

The status response includes detailed information about all entities:

```typescript
{
  type: "status",
  time: number,              // Total game hours
  gameHours: number,         // Floored hours
  gameDays: number,          // Floored days
  isPaused: boolean,
  player: {
    id: number,
    position: {x: number, y: number},
    health: number,
    hunger: number,
    age: number,
    food: number,            // Number of food items
    activeAction: string,    // Current activity (idle, moving, gathering, etc.)
    tribeId: number
  },
  population: {
    humans: number,
    bushes: number,
    prey: number,
    predators: number
  },
  humans: Array<{
    id: number,
    position: {x: number, y: number},
    health: number,
    hunger: number,
    age: number,
    gender: "male" | "female",
    isPlayer: boolean,
    activeAction: string,
    tribeId: number
  }>,
  berryBushes: Array<{
    id: number,
    position: {x: number, y: number},
    foodCount: number        // Number of berries available
  }>,
  preyAnimals: Array<{
    id: number,
    position: {x: number, y: number},
    health: number
  }>,
  predatorAnimals: Array<{
    id: number,
    position: {x: number, y: number},
    health: number
  }>
}
```

## Developing Game Strategies

You can develop automated strategies by creating scripts that:
1. Spawn the simulation process
2. Send commands via stdin
3. Read game state from stdout
4. Make decisions based on the state

### Example Strategy Implementation

See `scripts/strategy-example.ts` for a complete working example. Here's the core loop:

```typescript
import { spawn } from 'child_process';

// Start simulation
const sim = spawn('bash', ['scripts/run-simulation.sh']);

// Send commands
function send(cmd: any) {
  sim.stdin.write(JSON.stringify(cmd) + '\n');
}

// Listen to responses
sim.stdout.on('data', (data) => {
  const state = JSON.parse(data.toString());
  
  if (state.type === 'status' && state.player) {
    // Example: Gather food when hungry
    if (state.player.hunger > 60 && state.player.food < 3) {
      const bushesWithFood = state.berryBushes.filter(b => b.foodCount > 0);
      if (bushesWithFood.length > 0) {
        // Find nearest bush
        const nearest = bushesWithFood.reduce((closest, bush) => {
          const distCurrent = distance(state.player.position, bush.position);
          const distClosest = distance(state.player.position, closest.position);
          return distCurrent < distClosest ? bush : closest;
        });
        // Gather from it
        send({ command: 'gather', entityId: nearest.id });
      }
    }
  }
});

// Request status updates
setInterval(() => send({ command: 'status' }), 1000);
```

### Key Strategy Considerations

When developing strategies, keep in mind:

1. **Hunger Management**: Hunger increases over time. Gather food before it's too late!
2. **Berry Bush Locations**: Track which bushes have food and which are depleted
3. **Movement Costs**: Moving takes time and increases hunger
4. **Procreation Timing**: Requires low hunger and sufficient food reserves
5. **Planting**: Requires 5 berries and creates sustainable food sources
6. **Population Growth**: More humans means more food needs but also more workers

## Strategy Ideas

Here are some strategies you might explore:

1. **Survival Strategy**: Focus on maintaining food and health
   - Gather when hungry
   - Avoid predators
   - Plant bushes for sustainable food

2. **Growth Strategy**: Maximize population
   - Procreate frequently
   - Plant many bushes
   - Protect children

3. **Expansion Strategy**: Spread across the map
   - Move to unexplored areas
   - Plant bushes in strategic locations
   - Form multiple tribes

4. **Combat Strategy**: Dominate through strength
   - Hunt prey for food
   - Defend against predators
   - Attack rival tribes

5. **Resource Management**: Optimize resource collection
   - Track bush locations and regrowth
   - Balance gathering vs planting
   - Manage inventory efficiently

## Performance Notes

- The simulation runs at 60 FPS by default
- Game time progresses faster than real time
- You can pause/resume to examine state without time pressure
- The simulation is deterministic given the same random seed

## Troubleshooting

**Simulation won't start:**
- Make sure you're in the tribe2 directory
- Ensure dependencies are installed: `npm install`

**Commands not working:**
- Check that your JSON is valid
- Verify entity IDs exist in the current game state
- Some actions require prerequisites (e.g., planting needs 5 berries)

**Simulation crashes:**
- Check stderr output for error messages
- The simulation may end if all humans die
- Some game states may trigger game over conditions
