import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { GameState, GameStateComponent } from './types';
import { GameResult } from './state-playing/game-over-controller';
import { GameStatePlaying } from './state-playing/state-playing';
import playerLostBackground from '../assets/player-lost-background.png';
import playerWonBackground from '../assets/player-won-background.png';
import drawBackground from '../assets/draw-background.png';

const Container = styled.div<{ backgroundImage: string }>`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url(${(props) => props.backgroundImage});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
  }

  > div {
    z-index: 1;
    background-color: rgba(0, 0, 0, 0.7);
    padding: 2rem;
    border-radius: 10px;
    text-align: center;
  }

  h2 {
    font-size: 3rem;
    color: #ffffff;
    margin-bottom: 1rem;
  }

  p {
    font-size: 1.5rem;
    color: #ffffff;
    margin-bottom: 2rem;
  }

  button {
    font-size: 1.5rem;
    padding: 10px 20px;
    background-color: #ff4500;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: #ff6347;
    }
  }

  a {
    display: inline-block;
    margin-top: 1rem;
    font-size: 1.2rem;
    color: #ffffff;
    text-decoration: none;
    transition: color 0.3s ease;

    &:hover {
      color: #ff4500;
    }
  }
`;

const PlayedComponent: GameStateComponent = ({ setGameState }) => {
  const {
    state: { result },
  } = useLocation() as { state: { result: GameResult } };

  const handlePlayAgain = () => {
    setGameState(GameStatePlaying, { stateName: result.stateNames[result.playerStateId] });
  };

  let backgroundImage;
  let message;
  if (!result.winner) {
    backgroundImage = drawBackground;
    message = "It's a draw! The world is partially destroyed, but there's still hope.";
  } else if (result.winner === result.playerStateId) {
    backgroundImage = playerWonBackground;
    message = `Congratulations! ${result.stateNames[result.playerStateId]} has won with ${result.populations[result.playerStateId] << 0} population alive.`;
  } else if (result.winner !== undefined) {
    backgroundImage = playerLostBackground;
    message = `${result.stateNames[result.winner]} has won with ${result.populations[result.winner] << 0} population alive. Your state has fallen.`;
  } else {
    // Fallback message if winner is undefined
    backgroundImage = drawBackground;
    message = 'The game has ended in an unexpected state.';
  }

  return (
    <Container backgroundImage={backgroundImage}>
      <div>
        <h2>Game Over</h2>
        <p>{message}</p>
        <button onClick={handlePlayAgain}>Play Again</button>
        <br />
        <a href="/games/nukes/">Back to main menu</a>
      </div>
    </Container>
  );
};

export const GameStatePlayed: GameState = {
  Component: PlayedComponent,
  path: 'played',
};
