import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useRafLoop } from 'react-use';
import { BattleState, GameInput, CharacterAction } from '../game/battle-state/battle-types';
import { updateBattle, initializeBattleState } from '../game/battle-state/battle-update';
import { Renderer } from '../game/renderer/renderer';

interface GameScreenProps {}

export const GameScreen: React.FC<GameScreenProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<GameInput>({ playerIndex: 0, input: { actionEnabled: {} } });
  const lastUpdateTimeRef = useRef<number>(0);

  useEffect(() => {
    const initializeGame = async () => {
      if (canvasRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const initialBattleState = await initializeBattleState();
        setBattleState(initialBattleState);

        const renderer = new Renderer(canvasRef.current, clientWidth, clientHeight);
        rendererRef.current = renderer;
        lastUpdateTimeRef.current = performance.now();
      }
    };

    initializeGame();
  }, []);

  useRafLoop((time) => {
    if (battleState && rendererRef.current) {
      const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Convert to seconds
      lastUpdateTimeRef.current = time;

      const updatedBattleState = updateBattle(battleState, deltaTime, inputRef.current);
      setBattleState(updatedBattleState);
      rendererRef.current.render(updatedBattleState);
    }
  });

  useEffect(() => {
    const handler = (enabled: boolean) => (event: KeyboardEvent) => {
      const input = inputRef.current.input;

      switch (event.key) {
        case 'w':
        case 'ArrowUp':
          input.actionEnabled[CharacterAction.MOVE_UP] = enabled;
          break;
        case 's':
        case 'ArrowDown':
          input.actionEnabled[CharacterAction.MOVE_DOWN] = enabled;
          break;
        case 'a':
        case 'ArrowLeft':
          input.actionEnabled[CharacterAction.MOVE_LEFT] = enabled;
          break;
        case 'd':
        case 'ArrowRight':
          input.actionEnabled[CharacterAction.MOVE_RIGHT] = enabled;
          break;
        case ' ':
          input.actionEnabled[CharacterAction.JUMP] = enabled;
          break;
        case 'q':
          input.actionEnabled[CharacterAction.ROTATE_LEFT] = enabled;
          break;
        case 'e':
          input.actionEnabled[CharacterAction.ROTATE_RIGHT] = enabled;
          break;
        case 'f':
          input.actionEnabled[CharacterAction.ATTACK] = enabled;
          break;
        case 'r':
          input.actionEnabled[CharacterAction.BLOCK] = enabled;
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
  }, [battleState]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current && rendererRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        rendererRef.current.setSize(clientWidth, clientHeight);
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
      <GameUI>
        {battleState && (
          <div>
            Player 1: {JSON.stringify(battleState.characters[0].position)}
            <br />
            Player 2: {JSON.stringify(battleState.characters[1].position)}
          </div>
        )}
      </GameUI>
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
