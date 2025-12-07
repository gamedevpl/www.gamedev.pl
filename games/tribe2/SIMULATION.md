# Headless Game Simulation

This PR adds headless simulation capability to Tribe2, enabling automated gameplay and AI strategy development.

## What was added

### Core Scripts

1. **`scripts/simulate.ts`** - Main headless simulation server
   - Runs game loop at 60 FPS without browser
   - Accepts JSON commands via stdin
   - Outputs game state via stdout
   - Handles player actions through autopilot system

2. **`scripts/mp3-loader.mjs`** - Node.js ESM loader
   - Stubs out .mp3 file imports for headless mode
   - Enables game code to run without Web Audio API

3. **`scripts/run-simulation.sh`** - Wrapper script
   - Simplifies running simulation with correct Node options

4. **`scripts/play.ts`** - Interactive player
   - Command-line interface for manual gameplay
   - Demonstrates basic stdin/stdout IPC

5. **`scripts/strategy-example.ts`** - AI strategy demo
   - Working example of automated gameplay
   - Implements survival strategy (gather, plant, procreate)
   - Shows how to build game-playing AIs

### Key Features

- ✅ **Headless execution** - No browser or UI required
- ✅ **IPC via stdin/stdout** - Process can be controlled programmatically
- ✅ **Full game state exposure** - Access to all entities (humans, bushes, animals)
- ✅ **Real-time control** - Send commands while game is running
- ✅ **Pause/resume** - Control simulation speed
- ✅ **Strategy development** - Framework for AI experimentation

### Commands

```json
{"command": "status"}          // Get current game state
{"command": "move", "x": 100, "y": 200}
{"command": "gather", "entityId": 123}
{"command": "attack", "entityId": 456}
{"command": "plant", "x": 100, "y": 200}
{"command": "procreate", "entityId": 789}
{"command": "pause"}
{"command": "resume"}
{"command": "quit"}
```

## Usage

### Quick Start

```bash
cd games/tribe2

# Run simulation
npm run simulate

# Run interactive player
npm run play

# Run example AI strategy
NODE_OPTIONS="--loader ./scripts/mp3-loader.mjs --no-warnings" npx tsx scripts/strategy-example.ts
```

### Creating AI Strategies

See `scripts/strategy-example.ts` for a complete working example. Basic pattern:

```typescript
import { spawn } from 'child_process';

const sim = spawn('bash', ['scripts/run-simulation.sh']);

sim.stdout.on('data', (data) => {
  const state = JSON.parse(data.toString());
  if (state.type === 'status') {
    // Make decisions based on state
    // Send commands to control the player
  }
});

setInterval(() => {
  sim.stdin.write('{"command": "status"}\n');
}, 1000);
```

## Technical Details

### Challenges Solved

1. **MP3 imports** - Game imports sound files which Node.js can't load
   - Solution: Custom ESM loader that stubs .mp3 modules

2. **IndexedDB persistence** - Game tries to autosave to browser storage
   - Solution: Disable autosave in headless mode

3. **Web Audio API** - Sound system uses browser-only APIs
   - Solution: Existing guards check for `typeof window === 'undefined'`

### Architecture

```
┌─────────────┐        stdin (JSON commands)         ┌──────────────┐
│   Strategy  │ ────────────────────────────────────> │  Simulation  │
│   Script    │                                       │   Process    │
└─────────────┘ <──────────────────────────────────── └──────────────┘
                 stdout (JSON game state)
```

The simulation runs the full game loop including:
- Entity updates (humans, animals, plants)
- AI behavior trees
- Interactions (gathering, combat, procreation)
- Ecosystem balancing
- Tutorial progression (can be ignored)

## Future Improvements

Potential enhancements:
- [ ] Replay system (record/playback command sequences)
- [ ] Multiplayer simulation (multiple controlled characters)
- [ ] Benchmark mode (test strategies over many runs)
- [ ] Machine learning integration (train RL agents)
- [ ] Genetic algorithms (evolve strategies)
- [ ] Tournament system (pit strategies against each other)

## Documentation

Full documentation is in `games/tribe2/scripts/README.md`
