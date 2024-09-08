import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { useRafLoop } from 'react-use';
import { GameState, GameInput, WarriorAction } from '../game/game-state/game-state-types';
import { updateGameState, initGameState } from '../game/game-state/game-state-update';
import {
  renderGameState,
  initializeRenderer,
  cleanupRenderer,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from '../game/renderer/renderer';
import { usePixiApp } from '../game/renderer/hooks';
import { initPhysicsState, updatePhysicsState } from '../game/physics/physics-convert';
import { PhysicsState } from '../game/physics/physics-types';
import { renderPhysicsDebug } from '../game/renderer/physics-debug-renderer';

interface GameScreenProps {}

export const GameScreen: React.FC<GameScreenProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => initGameState());
  const physicsStateRef = useRef<PhysicsState | null>(null);
  const inputRef = useRef<GameInput>({ playerIndex: 0, input: { actionEnabled: {} } });
  const lastUpdateTimeRef = useRef<number>(0);
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(true);
  const debugCanvasContainerRef = useRef<HTMLDivElement>(null);

  const { app, loading } = usePixiApp(canvasRef);

  useEffect(() => {
    if (app && !loading) {
      physicsStateRef.current = initPhysicsState(gameState);
      initializeRenderer(app);
    }
  }, [app, loading]);

  const updateAndRenderGame = useCallback(
    (time: number) => {
      if (lastUpdateTimeRef.current && app && !loading && physicsStateRef.current) {
        const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Convert to seconds

        const updatedPhysicsState = updatePhysicsState(physicsStateRef.current, gameState);
        const updatedGameState = updateGameState(updatedPhysicsState, deltaTime, inputRef.current);
        setGameState(updatedGameState);

        // Update physics state reference
        physicsStateRef.current = updatedPhysicsState;

        renderGameState(app, updatedGameState);

        if (showPhysicsDebug && debugCanvasContainerRef.current) {
          renderPhysicsDebug(debugCanvasContainerRef.current, physicsStateRef.current);
        }
      }

      lastUpdateTimeRef.current = time;
    },
    [gameState, app, loading, showPhysicsDebug],
  );

  useRafLoop(updateAndRenderGame);

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
        case 'q':
          if (event.type === 'keyup') {
            setShowPhysicsDebug(!showPhysicsDebug);
          }
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
  }, [showPhysicsDebug]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        app?.renderer?.resize(clientWidth, clientHeight);
      }
    };

    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cleanupRenderer(); // Clean up renderer resources
    };
  }, [app]);

  return (
    <GameScreenContainer ref={containerRef}>
      <GameCanvas ref={canvasRef} />
      {showPhysicsDebug && <DebugCanvasContainer ref={debugCanvasContainerRef} />}
      <GameUI>
        <DebugInfo>
          Time: {gameState.time.toFixed(2)}s
          <br />
          Warrior Position: ({gameState.warriors[0].position.x.toFixed(2)},{' '}
          {gameState.warriors[0].position.y.toFixed(2)})
        </DebugInfo>
        <Controls>
          Use A/D or Left/Right Arrow keys to move
          <br />
          Press Q to toggle debug view
        </Controls>
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
  left: 50%;
  transform: translateX(-50%);
  width: ${SCREEN_WIDTH}px;
  height: ${SCREEN_HEIGHT}px;
`;

const DebugCanvasContainer = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: ${SCREEN_WIDTH}px;
  height: ${SCREEN_HEIGHT}px;
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

const DebugInfo = styled.div`
  margin-bottom: 10px;
`;

const Controls = styled.div`
  font-size: 12px;
`;
