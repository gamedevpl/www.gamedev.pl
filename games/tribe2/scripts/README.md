# Game Simulation Scripts

This directory contains scripts for running the Tribe2 game simulation in a headless mode, allowing automated gameplay and strategy development.

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

The status response includes:

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
    activeAction: string,
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
  }>
}
```

## Developing Game Strategies

You can develop automated strategies by:

1. **Using the interactive player**: Run `play.ts` and use the `strategy` command to enable basic automation
2. **Creating custom scripts**: Create your own script that spawns the simulation process and implements decision-making logic
3. **Using external tools**: Any tool that can read/write to stdin/stdout can control the simulation

### Example Strategy Script

```typescript
import { spawn } from 'child_process';

const sim = spawn('npx', ['tsx', 'scripts/simulate.ts']);

// Send commands
function send(cmd: any) {
  sim.stdin.write(JSON.stringify(cmd) + '\n');
}

// Listen to responses
sim.stdout.on('data', (data) => {
  const state = JSON.parse(data.toString());
  
  if (state.type === 'status' && state.player) {
    // Implement your strategy here
    if (state.player.hunger > 50) {
      // Find nearest bush and gather
      send({ command: 'gather', entityId: findNearestBush(state) });
    }
  }
});

// Request periodic updates
setInterval(() => send({ command: 'status' }), 1000);
```

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
