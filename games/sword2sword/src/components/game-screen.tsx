import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useRafLoop } from 'react-use';

interface GameScreenProps {}

export const GameScreen: React.FC<GameScreenProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // TODO: Initialize battle state
  // TODO: Initialize renderer

  useRafLoop((time) => {
    // TODO: implement main game loop and rendering
  });

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [canvasRef]);

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
`;
