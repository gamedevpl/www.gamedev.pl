import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { GameWorldState } from '../game/world-types';
import { loadGame, saveGame, clearSavedGame } from '../game/persistence/persistence-utils';

export type AppState = 'intro' | 'game' | 'gameOver' | 'editor';

interface GameOverDetails {
  generations: number;
  cause: string;
}

interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState, details?: GameOverDetails) => void;
  returnToIntro: () => void;
  gameOverDetails?: GameOverDetails;
  contextReady: boolean;
  savedGameState: GameWorldState | null;
  setSavedGameState: (state: GameWorldState | null) => void;
  saveCurrentGame: (state: GameWorldState) => void;
  clearCurrentSave: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{
  initialAppState: AppState;
  children: ReactNode;
}> = ({ initialAppState, children }) => {
  const [appState, setAppStateValue] = useState<AppState>(initialAppState);
  const [gameOverDetails, setGameOverDetails] = useState<GameOverDetails | undefined>(undefined);
  const [savedGameState, setSavedGameState] = useState<GameWorldState | null>(null);
  const [contextReady, setContextReady] = useState<boolean>(false);

  useEffect(() => {
    loadGame().then((loadedGame) => {
      if (loadedGame) {
        setSavedGameState(loadedGame);
      }
      setContextReady(true);
    });
  }, []);

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
    // Clear saved game when returning to intro
    clearCurrentSave();
  };

  const saveCurrentGame = (state: GameWorldState) => {
    saveGame(state);
    setSavedGameState(state);
  };

  const clearCurrentSave = () => {
    clearSavedGame();
    setSavedGameState(null);
  };

  return (
    <GameContext.Provider
      value={{
        appState,
        setAppState,
        returnToIntro,
        gameOverDetails,
        contextReady,
        savedGameState,
        setSavedGameState,
        saveCurrentGame,
        clearCurrentSave,
      }}
    >
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
