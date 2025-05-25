import React, { createContext, useState, useContext, ReactNode } from 'react';

export type AppState = 'intro' | 'game';

interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ initialAppState: AppState; children: ReactNode }> = ({
  initialAppState,
  children,
}) => {
  const [appState, setAppState] = useState<AppState>(initialAppState);

  return <GameContext.Provider value={{ appState, setAppState }}>{children}</GameContext.Provider>;
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};
