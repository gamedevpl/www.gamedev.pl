import React, { useRef, useEffect } from "react";
import { useRafLoop } from "react-use";
import { updateWorld } from "../game/world-update";
import { GameWorldState } from "../game/world-types";
import { renderGame } from "../game/render";
import { findPlayerEntity, getAvailablePlayerActions } from "../game/utils/world-utils";
import { playSound } from "../game/sound/sound-utils";
import { SoundType } from "../game/sound/sound-types";
import { Vector2D } from "../game/utils/math-types";
import { PlayerActionHint } from "../game/ui/ui-types";
import { GameInputController } from "./game-input-controller";
import { updateViewportCenter } from "../game/utils/camera-utils";
import { AppState } from "../context/game-context";

interface GameWorldControllerProps {
  gameStateRef: React.MutableRefObject<GameWorldState>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  isDebugOnRef: React.MutableRefObject<boolean>;
  isEcosystemDebugOnRef: React.MutableRefObject<boolean>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  playerActionHintsRef: React.MutableRefObject<PlayerActionHint[]>;
  keysPressed: React.MutableRefObject<Set<string>>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  setAppState: (state: AppState, details?: { generations: number; cause: string }) => void;
  appState: AppState;
}

export const GameWorldController: React.FC<GameWorldControllerProps> = ({
  gameStateRef,
  ctxRef,
  isDebugOnRef,
  isEcosystemDebugOnRef,
  viewportCenterRef,
  playerActionHintsRef,
  keysPressed,
  canvasRef,
  setAppState,
  appState,
}) => {
  const lastUpdateTimeRef = useRef<number>();

  const [stopLoop, startLoop, isActive] = useRafLoop((time) => {
    if (!ctxRef.current || !lastUpdateTimeRef.current) {
      lastUpdateTimeRef.current = time;
      return;
    }
    const deltaTime = Math.min(time - lastUpdateTimeRef.current, 1000) / 1000; // Seconds (clamped to 1 second max)

    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);

    const player = findPlayerEntity(gameStateRef.current);

    if (player) {
      playerActionHintsRef.current = getAvailablePlayerActions(gameStateRef.current, player);
    } else {
      playerActionHintsRef.current = [];
    }

    // Update viewport center by calling the new utility function
    viewportCenterRef.current = updateViewportCenter(gameStateRef.current, viewportCenterRef.current, deltaTime);

    renderGame(
      ctxRef.current,
      gameStateRef.current,
      isDebugOnRef.current,
      viewportCenterRef.current,
      playerActionHintsRef.current,
      false, // isIntro
    );
    lastUpdateTimeRef.current = time;

    if (gameStateRef.current.gameOver && appState !== "gameOver") {
      playSound(SoundType.GameOver, {
        masterVolume: gameStateRef.current.masterVolume,
        isMuted: gameStateRef.current.isMuted,
      });
      setAppState("gameOver", {
        generations: gameStateRef.current.generationCount,
        cause: gameStateRef.current.causeOfGameOver || "Unknown",
      });
    }
  }, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  return (
    <GameInputController
      isActive={isActive}
      gameStateRef={gameStateRef}
      canvasRef={canvasRef}
      viewportCenterRef={viewportCenterRef}
      playerActionHintsRef={playerActionHintsRef}
      isDebugOnRef={isDebugOnRef}
      isEcosystemDebugOnRef={isEcosystemDebugOnRef}
      keysPressed={keysPressed}
    />
  );
};
