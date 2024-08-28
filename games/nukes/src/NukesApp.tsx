import { useNavigate, useSearchParams } from 'react-router-dom';

import { GameState } from './game-states/types';
import { GameStateIntro } from './game-states/state-intro';

import { GameStatePlay } from './game-states/state-play';
import { GameStatePlaying } from './game-states/state-playing/state-playing';
import { GameStatePlayed } from './game-states/state-played';

import { AppStyles } from './app-styles';

export const routes = [
  { path: GameStateIntro.path, element: <GameStateRoute state={GameStateIntro} /> },
  { path: GameStatePlay.path, element: <GameStateRoute state={GameStatePlay} /> },
  { path: GameStatePlaying.path, element: <GameStateRoute state={GameStatePlaying} /> },
  { path: GameStatePlayed.path, element: <GameStateRoute state={GameStatePlayed} /> },
];

export function NukesApp() {
  const [search] = useSearchParams();
  const path = search.get('path') ?? '';

  return <>{routes.find((route) => route.path === path)?.element}</>;
}

function GameStateRoute({ state }: { state: GameState }) {
  const navigate = useNavigate();

  return (
    <>
      <AppStyles />
      <state.Component
        setGameState={(state, params) => navigate({ search: 'path=' + state.path }, { state: params })}
      />
    </>
  );
}
