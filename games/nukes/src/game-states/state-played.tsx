import { useLocation } from 'react-router-dom';
import { GameState, GameStateComponent } from './types';
import { GameResult } from './state-playing/game-over-controller';
import { GameStatePlaying } from './state-playing/state-playing';

const PlayedComponent: GameStateComponent = ({ setGameState }) => {
  const {
    state: { result },
  } = useLocation() as { state: { result: GameResult } };

  const handlePlayAgain = () => {
    setGameState(GameStatePlaying, { stateName: result.stateNames[result.playerStateId] });
  };

  return (
    <div>
      <h2>Game Over</h2>
      {result.winner ? (
        <p>
          The winner is {result.stateNames[result.winner]} with {result.populations[result.winner]} population alive.
        </p>
      ) : (
        <p>It's a draw!</p>
      )}
      <button onClick={handlePlayAgain}>Play Again</button>
      <br />
      <br />
      <a href="/">Back to main menu</a>
    </div>
  );
};

export const GameStatePlayed: GameState = {
  Component: PlayedComponent,
  path: 'played',
};
