import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import {
  GameState,
  initGame,
  updateGame,
  renderGame,
  initSoundSystem,
  setMasterVolume,
  handleKeyDown,
  handleKeyUp,
  handleMouseMove,
  handleMouseClick,
  updateCameraFromInput,
} from '../game';

const GameContainer = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
`;

const Canvas = styled.canvas`
  display: block;
  width: 100%;
  height: 100%;
`;

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  // Initialize game on mount
  useEffect(() => {
    // Initialize sound system (requires user interaction)
    initSoundSystem();

    // Initialize game state
    gameStateRef.current = initGame();

    // Start game loop
    const gameLoop = (currentTime: number) => {
      if (!gameStateRef.current || !canvasRef.current) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Calculate delta time
      const deltaTime = lastFrameTimeRef.current === 0 ? 0 : (currentTime - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = currentTime;

      // Update game state
      gameStateRef.current = updateGame(gameStateRef.current, deltaTime);

      // Update camera based on input
      gameStateRef.current.viewportCenter = updateCameraFromInput(gameStateRef.current, deltaTime);

      // Update master volume
      setMasterVolume(gameStateRef.current.isMuted ? 0 : gameStateRef.current.masterVolume);

      // Render game
      renderGame(ctx, gameStateRef.current, gameStateRef.current.viewportCenter, canvas.width, canvas.height);

      // Continue loop
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    // Start the loop
    animationFrameRef.current = requestAnimationFrame(gameLoop);

    // Cleanup on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current) {
        gameStateRef.current = handleKeyDown(e.key, gameStateRef.current);
        
        // Prevent default for some keys
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (gameStateRef.current) {
        gameStateRef.current = handleKeyUp(e.key, gameStateRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Handle mouse/touch input
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseMove = (e: MouseEvent) => {
      if (gameStateRef.current) {
        const rect = canvas.getBoundingClientRect();
        gameStateRef.current = handleMouseMove(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          gameStateRef.current,
        );
      }
    };

    const onMouseClick = (e: MouseEvent) => {
      if (gameStateRef.current) {
        const rect = canvas.getBoundingClientRect();
        gameStateRef.current = handleMouseClick(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          gameStateRef.current.viewportCenter,
          canvas.width,
          canvas.height,
          gameStateRef.current,
        );
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onMouseClick);

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onMouseClick);
    };
  }, []);

  return (
    <GameContainer>
      <Canvas ref={canvasRef} />
    </GameContainer>
  );
};
