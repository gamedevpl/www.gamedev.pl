import { useState } from 'react';
import styled from 'styled-components';
import { GameState, GameStateComponent } from './types';
import { GameStatePlaying } from './state-playing/state-playing';
import { getRandomStateNames } from '../content/state-names';
import playBackground from '../assets/play-background.png';

const Container = styled.div`
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
    background-image: url(${playBackground});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
  }

  > div {
    background-color: rgba(0, 0, 0, 0.7);
    border-radius: 10px;
    z-index: 1;
    width: 600px;
    padding: 2em;
    box-shadow: 0px 0px 5px black;
  }

  input,
  select {
    font-size: 1.2rem;
    padding: 10px;
    margin-bottom: 20px;
    border: 2px solid #ff4500;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.8);
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

    &:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
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

const PlayComponent: GameStateComponent = ({ setGameState }) => {
  const [stateName, setStateName] = useState(getRandomStateNames(1)[0]);
  const [numberOfOpponents, setNumberOfOpponents] = useState(2);
  const [groundWarfare, setGroundWarfare] = useState(false);

  const handlePlay = () => {
    setGameState(GameStatePlaying, { stateName, numberOfOpponents, groundWarfare });
  };

  return (
    <Container>
      <div>
        <h2>Name your state:</h2>
        <input
          type="text"
          placeholder="Type your state name here"
          value={stateName}
          onChange={(event) => setStateName(event.currentTarget.value)}
        />
        <br />
        <h2>How many opponents?</h2>
        <select value={numberOfOpponents} onChange={(event) => setNumberOfOpponents(Number(event.currentTarget.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
        <h2>Ground warfare? (WIP)</h2>
        <input type="checkbox" checked={groundWarfare} onChange={() => setGroundWarfare(!groundWarfare)} />
        <br />
        <br />
        <button onClick={handlePlay} disabled={!stateName}>
          Start game
        </button>
        <br />
        <a href="/games/nukes/">Back to main menu</a>
      </div>
    </Container>
  );
};

export const GameStatePlay: GameState = {
  Component: PlayComponent,
  path: 'play',
};
