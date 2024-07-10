import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import './App.css';
import { GameState } from './game-states/types';
import { GameStateIntro } from './game-states/state-intro';

import { GameStatePlay } from './game-states/state-play';
import { GameStatePlaying } from './game-states/state-playing/state-playing';
import { GameStatePlayed } from './game-states/state-played';

import { GameStateTechWorld } from './game-states/state-tech-world';

function App() {
  return (
    <>
      <BrowserRouter basename="/">
        <Routes>
          <Route path={GameStateIntro.path} element={<GameStateRoute state={GameStateIntro} />} />
          <Route path={GameStatePlay.path} element={<GameStateRoute state={GameStatePlay} />} />
          <Route path={GameStatePlaying.path} element={<GameStateRoute state={GameStatePlaying} />} />
          <Route path={GameStatePlayed.path} element={<GameStateRoute state={GameStatePlayed} />} />
          <Route path={GameStateTechWorld.path} element={<GameStateRoute state={GameStateTechWorld} />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

function GameStateRoute({ state }: { state: GameState }) {
  const navigate = useNavigate();

  return <state.Component setGameState={(state, params) => navigate(state.path, { state: params })} />;
}

export default App;
