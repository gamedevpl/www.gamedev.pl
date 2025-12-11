import React, { useEffect, useRef, useState } from 'react';
import { DebugPanelType, GameWorldState } from '../game/world-types';
import { useGameContext } from '../context/game-context';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint } from '../game/ui/ui-types';
import { initGame } from '../game';
import { GameRender } from './game-render';
import { GameWorldController } from './game-world-controller';

export const GameScreen: React.FC = () => {
  const { savedGameState, contextReady } = useGameContext();

  // We use a state here to ensure initGame() is only called once if no save exists,
  // preventing re-initialization on re-renders of the wrapper.
  const [initialState, setInitialState] = useState<GameWorldState | null>(null);

  useEffect(() => {
    if (!contextReady) {
      return;
    }

    if (savedGameState) {
      console.log('Loading saved game state...');
      setInitialState(savedGameState);
    } else {
      console.log('Initializing new game state...');
      setInitialState(initGame());
    }
  }, [contextReady, savedGameState]);

  if (!contextReady || !initialState) {
    return <div>Loading...</div>;
  }

  return <GameScreenInitialised initialState={initialState} />;
};

const GameScreenInitialised: React.FC<{ initialState: GameWorldState }> = ({ initialState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initialState);
  const keysPressed = useRef<Set<string>>(new Set());
  const debugPanelTypeRef = useRef<DebugPanelType>(initialState.debugPanel);
  const viewportCenterRef = useRef<Vector2D>(initialState.viewportCenter);
  const playerActionHintsRef = useRef<PlayerActionHint[]>([]);
  // Note: debugCharacterId is managed within gameStateRef.current

  const { appState, setAppState } = useGameContext();

  return (
    <>
      <GameRender
        canvasRef={canvasRef}
        ctxRef={ctxRef}
        gameStateRef={gameStateRef}
        debugPanelTypeRef={debugPanelTypeRef}
        viewportCenterRef={viewportCenterRef}
        playerActionHintsRef={playerActionHintsRef}
      />
      <GameWorldController
        gameStateRef={gameStateRef}
        ctxRef={ctxRef}
        debugPanelTypeRef={debugPanelTypeRef}
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
