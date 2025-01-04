import { useRef, RefObject, useEffect, PropsWithChildren } from 'react';
import { useRafLoop, useWindowSize } from 'react-use';
import { renderGame } from './game-render/game-renderer';
import { GameWorldState } from './game-world/game-world-types';
import styled from 'styled-components';
import { RenderState } from './game-render/render-state';
import { InputController } from './game-input/input-controller';
import { GameController } from './game-controller';

const ViewportContainer = styled.div`
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;

  /* Prevent default touch behaviors */
  touch-action: none;
  -webkit-touch-callout: none;

  /* Prevent text selection during touch/drag */
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;

  /* Ensure proper touch handling on iOS */
  -webkit-tap-highlight-color: transparent;

  /* Ensure the viewport takes full priority for touch events */
  z-index: 1;
`;

const GameCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;

  /* Prevent any default touch behaviors on the canvas */
  touch-action: none;
  -webkit-touch-callout: none;

  /* Prevent dragging on the canvas */
  -webkit-user-drag: none;
  user-drag: none;

  /* Ensure proper rendering on high-DPI displays */
  image-rendering: pixelated;
  image-rendering: crisp-edges;
`;

interface GameViewportProps {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
}

export function GameViewport({ gameStateRef, children }: PropsWithChildren<GameViewportProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width: windowWidth, height: windowHeight } = useWindowSize();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions to match window size
    canvas.width = windowWidth;
    canvas.height = windowHeight;

    // Prevent default touch behaviors on the canvas
    const preventDefaultTouch = (e: TouchEvent) => {
      e.preventDefault();
    };

    // Add touch event listeners with passive: false to ensure preventDefault works
    canvas.addEventListener('touchstart', preventDefaultTouch, { passive: false });
    canvas.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    canvas.addEventListener('touchend', preventDefaultTouch, { passive: false });

    // Cleanup event listeners
    return () => {
      canvas.removeEventListener('touchstart', preventDefaultTouch);
      canvas.removeEventListener('touchmove', preventDefaultTouch);
      canvas.removeEventListener('touchend', preventDefaultTouch);
    };
  }, [windowWidth, windowHeight]);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || !gameStateRef.current) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render the game
    renderGame(ctx, gameStateRef.current.gameWorldState, gameStateRef.current.renderState);
  });

  return (
    <ViewportContainer>
      <GameCanvas ref={canvasRef} />
      <InputController gameStateRef={gameStateRef} />
      <GameController gameStateRef={gameStateRef} />
      {children}
    </ViewportContainer>
  );
}
