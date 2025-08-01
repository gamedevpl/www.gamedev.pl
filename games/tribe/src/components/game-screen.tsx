import React, { useRef, useState } from 'react';
import { GameWorldState } from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint } from '../game/ui/ui-types';
import { initGame } from '../game';
import { GameRender } from './game-render';
import { GameWorldController } from './game-world-controller';

export const GameScreen: React.FC = () => {
  const [initialState] = useState(() => initGame());

  return <GameScreenInitialised initialState={initialState} />;
};

const GameScreenInitialised: React.FC<{ initialState: GameWorldState }> = ({ initialState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initialState);
  const keysPressed = useRef<Set<string>>(new Set());
  const isDebugOnRef = useRef<boolean>(false);
  const isEcosystemDebugOnRef = useRef<boolean>(false);
  const viewportCenterRef = useRef<Vector2D>(initialState.viewportCenter);
  const playerActionHintsRef = useRef<PlayerActionHint[]>([]);

  const { appState, setAppState } = useGameContext();

  return (
    <>
      <GameRender
        canvasRef={canvasRef}
        ctxRef={ctxRef}
        gameStateRef={gameStateRef}
        isDebugOnRef={isDebugOnRef}
        viewportCenterRef={viewportCenterRef}
        playerActionHintsRef={playerActionHintsRef}
      />
      <GameWorldController
        gameStateRef={gameStateRef}
        ctxRef={ctxRef}
        isDebugOnRef={isDebugOnRef}
        isEcosystemDebugOnRef={isEcosystemDebugOnRef}
        viewportCenterRef={viewportCenterRef}
        playerActionHintsRef={playerActionHintsRef}
        keysPressed={keysPressed}
        canvasRef={canvasRef}
        setAppState={setAppState}
        appState={appState}
      />
    </>
  );
};
