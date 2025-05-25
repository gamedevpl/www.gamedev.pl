import React, { createContext, useState, useContext, ReactNode } from 'react';

type AppState = 'intro' | 'game';

interface GameContextType {
  appState: AppState;
  setAppState: (state: AppState) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>('intro');

  return (
    <GameContext.Provider value={{ appState, setAppState }}>
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