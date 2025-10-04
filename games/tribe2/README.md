# Tribe 2

A new game built on the framework extracted from the Tribe game.

## Framework Overview

This project uses a clean React-based framework with the following components:

### Core Architecture

- **React 18**: Modern React with hooks and concurrent features
- **TypeScript**: Type-safe development
- **Styled Components**: CSS-in-JS styling solution
- **Vite**: Fast build tool and dev server

### State Management

The framework uses React Context for state management:

- `GameContext`: Manages app state (intro, game, gameOver)
- Supports game over details (generations, cause)
- Easy state transitions between screens

### Routing & Persistence

- URL hash-based routing (`#game` for game screen)
- State persistence via `usePersistState` hook
- Supports deep linking to game state

### Project Structure

```
src/
├── components/          # React components
│   ├── app.tsx         # Main app component
│   ├── intro-screen.tsx
│   ├── game-screen.tsx
│   └── game-over-screen.tsx
├── context/            # React context providers
│   └── game-context.tsx
├── hooks/              # Custom React hooks
│   └── persist-state.ts
├── styles/             # Global styles
│   └── global.ts
└── index.tsx          # App entry point
```

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm start
```

The app will be available at `http://localhost:5173/`

### Build

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm run test
```

## Adding Game Logic

The framework is ready for game development. Here's how to extend it:

### 1. Add Game State

Extend the `GameContext` in `src/context/game-context.tsx` with game-specific state:

```typescript
interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState, details?: GameOverDetails) => void;
  returnToIntro: () => void;
  gameOverDetails?: GameOverDetails;
  // Add your game state here
  gameData?: YourGameData;
  updateGameData?: (data: YourGameData) => void;
}
```

### 2. Implement Game Screen

Update `src/components/game-screen.tsx` to include your game logic:

```typescript
export const GameScreen: React.FC = () => {
  // Add game loop, rendering, input handling, etc.
  return (
    <GameContainer>
      {/* Your game content */}
    </GameContainer>
  );
};
```

### 3. Add Game-Specific Components

Create new components in `src/components/` as needed for your game UI.

### 4. Add Game Logic Modules

Create game logic modules (e.g., `src/game/`) similar to the tribe game structure:
- World state management
- Game loop and updates
- Rendering logic
- AI and behavior systems

## Key Features

- ✅ Screen navigation (intro → game → game over)
- ✅ URL-based state persistence
- ✅ Styled with Press Start 2P retro font
- ✅ TypeScript type safety
- ✅ Fast development with Vite HMR
- ✅ Production-ready build configuration

## Next Steps

1. Design your game mechanics
2. Implement game state and logic
3. Add game-specific rendering
4. Create game assets (sprites, sounds, etc.)
5. Implement game loop and updates
6. Add game-specific UI elements
7. Test and iterate

## License

ISC
