import React from "react";
import { useGameContext } from "../context/game-context";
import { IntroScreen } from "./intro-screen";
import { GameScreen } from "./game-screen";
import { GameOverScreen } from "./GameOverScreen"; // Will be created
import { GlobalStyle } from "../styles/global";
import { usePersistState } from "../hooks/persist-state";

export const App: React.FC = () => {
  const { appState, setAppState } = useGameContext();

  // usePersistState might need adjustment if gameOver state should not persist 
  // or if it needs to clear gameOverDetails on reload to intro/game.
  // For now, assuming its current hash-based logic is for 'intro' and 'game' primarily.
  usePersistState(appState, setAppState);

  const renderContent = () => {
    switch (appState) {
      case "intro":
        return <IntroScreen />;
      case "game":
        return <GameScreen />;
      case "gameOver":
        return <GameOverScreen />;
      default:
        return <IntroScreen />; // Fallback to intro screen
    }
  };

  return (
    <>
      <GlobalStyle />
      {renderContent()}
    </>
  );
};
