import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { useRafLoop } from 'react-use';
import { initIntroWorld } from '../game/world-init';
import { updateWorld } from '../game/world-update';
import { renderGame } from '../game/render';
import { GameWorldState } from '../game/world-types';
import { findAllHumans } from '../game/utils/world-utils';
import { vectorLerp } from '../game/utils/math-utils';
import { Vector2D } from '../game/utils/math-types';
import { VIEWPORT_FOLLOW_SPEED } from '../game/world-consts';
import { EntityId } from '../game/entities/entities-types';
import { playSound, stopSound } from '../game/sound/sound-utils';
import { SoundType } from '../game/sound/sound-types';

const IntroContainer = styled.div`
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
`;

const StyledCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #2c5234;
`;

const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 1;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.7) 100%);
`;

const Title = styled.h1`
  font-family: 'Press Start 2P', cursive;
  font-size: 4rem;
  color: #fff;
  text-shadow: 4px 4px 0px #ff0000;
  margin-bottom: 2rem;
`;

const StartButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 1.5rem;
  padding: 1rem 2rem;
  color: #fff;
  background-color: #ff0000;
  border: 2px solid #fff;
  box-shadow: 4px 4px 0px #fff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: #fff;
    color: #ff0000;
    box-shadow: 4px 4px 0px #ff0000;
  }
`;

const INTRO_SOUNDTRACK_ID = 'intro-soundtrack';

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initIntroWorld());
  const lastUpdateTimeRef = useRef<number>();
  const viewportCenterRef = useRef<Vector2D>(gameStateRef.current.viewportCenter);
  const focusedHumanIdRef = useRef<EntityId | undefined>();

  useEffect(() => {
    playSound(SoundType.SoundTrack1, { loop: true, trackId: INTRO_SOUNDTRACK_ID });

    return () => {
      stopSound(INTRO_SOUNDTRACK_ID, 2); // Fade out over 2 seconds on component unmount
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas && ctxRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        renderGame(
          ctxRef.current,
          gameStateRef.current,
          false, // isDebugOn
          viewportCenterRef.current,
          [], // playerActionHints
          true, // isIntro
        );
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Viewport switching logic
  useEffect(() => {
    const INTRO_SCREEN_VIEWPORT_SWITCH_INTERVAL_MS = 5000;
    
    const switchFocus = () => {
      const humans = findAllHumans(gameStateRef.current);
      if (humans.length > 0) {
        const randomIndex = Math.floor(Math.random() * humans.length);
        focusedHumanIdRef.current = humans[randomIndex].id;
      }
    };

    switchFocus(); // Initial focus
    const intervalId = setInterval(switchFocus, INTRO_SCREEN_VIEWPORT_SWITCH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  const [stopLoop, startLoop] = useRafLoop((time) => {
    if (!ctxRef.current) return;
    if (lastUpdateTimeRef.current === undefined) {
      lastUpdateTimeRef.current = time;
      return;
    }
    const deltaTime = Math.min((time - lastUpdateTimeRef.current) / 1000, 1); // Seconds (clamped to 1 second max)

    // Update game state
    gameStateRef.current = updateWorld(gameStateRef.current, deltaTime);

    // Update viewport
    const focusedHuman = focusedHumanIdRef.current
      ? gameStateRef.current.entities.entities.get(focusedHumanIdRef.current)
      : undefined;

    if (focusedHuman) {
      const { mapDimensions } = gameStateRef.current;
      const { width, height } = mapDimensions;
      let targetPosition = { ...focusedHuman.position };

      const dx = targetPosition.x - viewportCenterRef.current.x;
      if (Math.abs(dx) > width / 2) {
        if (dx > 0) {
          targetPosition.x -= width;
        } else {
          targetPosition.x += width;
        }
      }

      const dy = targetPosition.y - viewportCenterRef.current.y;
      if (Math.abs(dy) > height / 2) {
        if (dy > 0) {
          targetPosition.y -= height;
        } else {
          targetPosition.y += height;
        }
      }
      let newViewportCenter = vectorLerp(viewportCenterRef.current, targetPosition, VIEWPORT_FOLLOW_SPEED * deltaTime);

      newViewportCenter = {
        x: ((newViewportCenter.x % width) + width) % width,
        y: ((newViewportCenter.y % height) + height) % height,
      };

      viewportCenterRef.current = newViewportCenter;
    }

    // Render game
    renderGame(
      ctxRef.current,
      gameStateRef.current,
      false, // isDebugOn
      viewportCenterRef.current,
      [], // playerActionHints
      true, // isIntro
    );

    lastUpdateTimeRef.current = time;
  }, false);

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, [startLoop, stopLoop]);

  const handleStartGame = () => {
    stopSound(INTRO_SOUNDTRACK_ID, 2); // Fade out over 2 seconds
    setAppState('game');
  };

  return (
    <IntroContainer>
      <StyledCanvas ref={canvasRef} />
      <Overlay>
        <Title>Tribe</Title>
        <StartButton onClick={handleStartGame}>Start Game</StartButton>
      </Overlay>
    </IntroContainer>
  );
};
