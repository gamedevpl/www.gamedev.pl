import { useState } from 'react';
import './App.css';
import { GameState } from './game-states/types';
import GameStateIntro from './game-states/state-intro';
import GameStateMap from './game-states/state-techdemo-map';
import GameStateNuke from './game-states/state-techdemo-nuke';

function App() {
  const [currentGameState, setGameState] = useState<GameState>(() => {
    if (document.location.pathname === '/techdemo-nuke') {
      return GameStateNuke;
    } else if (document.location.pathname === '/techdemo-map') {
      return GameStateMap;
    } else {
      return GameStateIntro;
    }
  });

  const GameStateComponent = currentGameState?.Component;

  return (
    <>
      <GameStateComponent setGameState={setGameState} />
    </>
  );
}

export default App;
