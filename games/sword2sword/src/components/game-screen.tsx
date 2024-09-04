import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useRafLoop } from 'react-use';
import { GameState, GameInput, WarriorAction } from '../game/game-state/game-state-types';
import { updateGameState, initGameState } from '../game/game-state/game-state-update';
import { renderGameState } from '../game/renderer/renderer';

interface GameScreenProps {}

export const GameScreen: React.FC<GameScreenProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(initGameState);
  const inputRef = useRef<GameInput>({ playerIndex: 0, input: { actionEnabled: {} } });
  const lastUpdateTimeRef = useRef<number>(0);

  useRafLoop((time) => {
    if (gameState && canvasRef.current && lastUpdateTimeRef.current) {
      const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Convert to seconds

      const updatedBattleState = updateGameState(gameState, deltaTime, inputRef.current);
      setGameState(updatedBattleState);

      renderGameState(canvasRef.current, gameState);
    }

    lastUpdateTimeRef.current = time;
  });

  useEffect(() => {
    const handler = (enabled: boolean) => (event: KeyboardEvent) => {
      const input = inputRef.current.input;

      switch (event.key) {
        case 'a':
        case 'ArrowLeft':
          input.actionEnabled[WarriorAction.MOVE_LEFT] = enabled;
          break;
        case 'd':
        case 'ArrowRight':
          input.actionEnabled[WarriorAction.MOVE_RIGHT] = enabled;
          break;
      }
    };

    const handleKeyDown = handler(true);
    const handleKeyUp = handler(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <GameScreenContainer ref={containerRef}>
      <GameCanvas ref={canvasRef} />
      <GameUI></GameUI>
    </GameScreenContainer>
  );
};

const GameScreenContainer = styled.div`
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
`;

const GameCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const GameUI = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  color: white;
  font-family: 'Press Start 2P', cursive;
  font-size: 14px;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 10px;
  border-radius: 5px;
`;
