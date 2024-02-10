import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import './App.css';
import { GameState } from './game-states/types';
import { GameStateIntro } from './game-states/state-intro';
import { GameStateTechMap } from './game-states/state-tech-map';
import { GameStateTechNuke } from './game-states/state-tech-nuke';
import { GameStateTechWorld } from './game-states/state-tech-world';

function App() {
  return (
    <>
      <BrowserRouter basename="/">
        <Routes>
          <Route path={GameStateIntro.path} element={<GameStateRoute state={GameStateIntro} />} />
          <Route path={GameStateTechMap.path} element={<GameStateRoute state={GameStateTechMap} />} />
          <Route path={GameStateTechNuke.path} element={<GameStateRoute state={GameStateTechNuke} />} />
          <Route path={GameStateTechWorld.path} element={<GameStateRoute state={GameStateTechWorld} />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

function GameStateRoute({ state }: { state: GameState }) {
  const navigate = useNavigate();

  return <state.Component setGameState={(state) => navigate(state.path)} />;
}

export default App;
