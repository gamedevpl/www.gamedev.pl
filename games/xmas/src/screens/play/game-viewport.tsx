import { useRef, RefObject, useCallback } from 'react';
import { useRafLoop, useWindowSize } from 'react-use';
import { renderGame } from './game-render/game-renderer';
import { GameWorldState } from './game-world/game-world-types';
import styled from 'styled-components';

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
`;

const GameCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

interface GameViewportProps {
  gameStateRef: RefObject<GameWorldState>;
}

export function GameViewport({ gameStateRef }: GameViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width: windowWidth, height: windowHeight } = useWindowSize();

  useRafLoop(
    useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas dimensions to match window size
      canvas.width = windowWidth;
      canvas.height = windowHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!gameStateRef.current) return;

      // Render the game
      renderGame(ctx, gameStateRef.current);
    }, [windowWidth, windowHeight]),
  );

  return (
    <ViewportContainer>
      <GameCanvas ref={canvasRef} />
    </ViewportContainer>
  );
}
