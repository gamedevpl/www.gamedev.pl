import React, { createContext, useState, useContext, ReactNode } from 'react';

export type AppState = 'intro' | 'game' | 'gameOver';

// Using `unknown` is a type-safe way to represent a value whose type is not yet known.
// This resolves the `no-empty-object-type` linting error.
export type GameOverDetails = unknown;

interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState, details?: GameOverDetails) => void;
  returnToIntro: () => void;
  gameOverDetails?: GameOverDetails;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{
  initialAppState: AppState;
  children: ReactNode;
}> = ({ initialAppState, children }) => {
  const [appState, setAppStateValue] = useState<AppState>(initialAppState);
  const [gameOverDetails, setGameOverDetails] = useState<GameOverDetails | undefined>(undefined);

  const setAppState = (state: AppState, details?: GameOverDetails) => {
    setAppStateValue(state);
    if (state === 'gameOver' && details) {
      setGameOverDetails(details);
    } else if (state !== 'gameOver') {
      // Clear details if not in gameOver state to prevent stale data on re-entry to game
      setGameOverDetails(undefined);
    }
  };

  const returnToIntro = () => {
    setAppStateValue('intro');
    setGameOverDetails(undefined);
  };

  return (
    <GameContext.Provider value={{ appState, setAppState, returnToIntro, gameOverDetails }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};
