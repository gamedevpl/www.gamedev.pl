import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type AppState = 'intro' | 'game';

interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

interface GameProviderProps {
  children: ReactNode;
  initialAppState?: AppState;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children, initialAppState = 'intro' }) => {
  const [appState, setAppStateInternal] = useState<AppState>(initialAppState);

  const setAppState = useCallback((state: AppState) => {
    setAppStateInternal(state);
  }, []);

  return <GameContext.Provider value={{ appState, setAppState }}>{children}</GameContext.Provider>;
};

export const useGameContext = (): GameContextType => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};
