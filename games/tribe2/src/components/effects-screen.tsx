import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useGameContext } from '../context/game-context';
import { VisualEffect, VisualEffectType } from '../game/visual-effects/visual-effect-types';
import { addVisualEffect } from '../game/utils/visual-effects-utils';
import { visualEffectsUpdate } from '../game/visual-effects/visual-effects-update';
import { renderVisualEffect } from '../game/render/render-effects';
import { GameWorldState } from '../game/world-types';

const ScreenContainer = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  color: white;
  font-family: 'Arial', sans-serif;
`;

const Sidebar = styled.div`
  width: 300px;
  height: 100%;
  background-color: #222;
  border-right: 1px solid #444;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
`;

const CanvasContainer = styled.div`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Canvas = styled.canvas`
  background-color: #2c5234;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  border: 2px solid #444;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  margin-bottom: 20px;
  text-align: center;
`;

const Button = styled.button`
  background-color: #444;
  color: white;
  border: none;
  padding: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  transition: background-color 0.2s;

  &:hover {
    background-color: #666;
  }

  &:active {
    background-color: #888;
  }
`;

const BackButton = styled(Button)`
  background-color: #833;
  margin-top: auto;
  text-align: center;
  font-weight: bold;

  &:hover {
    background-color: #a44;
  }
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export const EffectsScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const mockState = useRef({
    time: 0,
    visualEffects: [] as VisualEffect[],
    nextVisualEffectId: 1,
    mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  } as GameWorldState);

  const triggerEffect = (type: VisualEffectType) => {
    const center = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    let targetPosition = undefined;

    if (type === VisualEffectType.StoneProjectile) {
      targetPosition = {
        x: center.x + 200 * (Math.random() - Math.random()),
        y: center.y + 200 * (Math.random() - Math.random()),
      };
    }

    addVisualEffect(
      mockState.current,
      type,
      center,
      1.0, // 1 hour duration
      undefined,
      undefined,
      targetPosition,
    );
  };

  useEffect(() => {
    const loop = () => {
      // Update
      const deltaTimeHours = 0.016; // Approx 60fps
      mockState.current.time += deltaTimeHours;
      visualEffectsUpdate(mockState.current);

      // Render
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#2c5234';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        mockState.current.visualEffects.forEach((effect) => {
          renderVisualEffect(ctx, effect, mockState.current.time, mockState.current);
        });
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  const effectTypes = Object.keys(VisualEffectType)
    .filter((key) => isNaN(Number(key)))
    .map((key) => ({
      name: key,
      value: VisualEffectType[key as keyof typeof VisualEffectType],
    }));

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Visual Effects</Title>
        {effectTypes.map((effect) => (
          <Button key={effect.name} onClick={() => triggerEffect(effect.value)}>
            {effect.name}
          </Button>
        ))}
        <BackButton onClick={returnToIntro}>Back to Intro</BackButton>
      </Sidebar>
      <CanvasContainer>
        <Canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        <p style={{ marginTop: '20px', color: '#888' }}>Effects are triggered at the center of the canvas.</p>
      </CanvasContainer>
    </ScreenContainer>
  );
};
