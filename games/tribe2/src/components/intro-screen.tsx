import React, { useRef, useEffect, useState } from 'react';
import { useRafLoop } from 'react-use';
import { useGameContext } from '../context/game-context';
import { generateHeightMap } from '../game/game-factory';
import { GameWorldState } from '../game/types/game-types';
import {
  BACKGROUND_COLOR,
  HEIGHT_MAP_RESOLUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
} from '../game/game-consts';
import { Vector2D } from '../game/types/math-types';
import { initIntroAnimation, updateIntroAnimation, IntroAnimState } from './intro-animation';
import { initWebGPUTerrain, renderWebGPUTerrain } from '../game/renderer/webgpu-renderer';

const introContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: BACKGROUND_COLOR,
};

const canvasStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', cursive",
  fontSize: '4rem',
  color: 'white',
  textShadow: '2px 2px 0px red, -2px -2px 0px red, 2px -2px 0px red, -2px 2px 0px red',
  marginBottom: '2rem',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: 'red',
  color: 'white',
  border: '3px solid white',
  fontFamily: "'Press Start 2P', cursive",
  fontSize: '1.5rem',
  padding: '1rem 2rem',
  cursor: 'pointer',
  borderRadius: 0,
  boxShadow: '5px 5px 0px #8B0000',
  transition: 'all 0.1s ease-in-out',
};

const buttonHoverStyle: React.CSSProperties = {
  transform: 'translate(5px, 5px)',
  boxShadow: '0px 0px 0px #8B0000',
};

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();
  const [isHovered, setIsHovered] = useState(false);
  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const heightMapRef = useRef<number[][] | null>(null);
  const gpuStateRef = useRef<GameWorldState['webgpu'] | null>(null);
  const viewportCenterRef = useRef<Vector2D>({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
  const viewportZoomRef = useRef<number>(1.0);
  const animStateRef = useRef<IntroAnimState | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = webgpuCanvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Generate height map and init GPU
    heightMapRef.current = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);

    animStateRef.current = initIntroAnimation(
      heightMapRef.current,
      { width: MAP_WIDTH, height: MAP_HEIGHT },
      { baseZoom: 0.8, focusZoom: 2.0, poiCount: 8 },
    );

    (async () => {
      gpuStateRef.current = await initWebGPUTerrain(
        canvas,
        heightMapRef.current!,
        { width: MAP_WIDTH, height: MAP_HEIGHT },
        HEIGHT_MAP_RESOLUTION,
      );
    })();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useRafLoop((time) => {
    const canvas = webgpuCanvasRef.current;
    const animState = animStateRef.current;
    if (!canvas || !animState || !gpuStateRef.current) return;

    const dtSeconds = lastTimeRef.current !== null ? (time - lastTimeRef.current) / 1000 : 0;
    lastTimeRef.current = time;

    const { center, zoom, lightDir } = updateIntroAnimation(animState, dtSeconds);
    viewportCenterRef.current = center;
    viewportZoomRef.current = zoom;

    renderWebGPUTerrain(gpuStateRef.current, center, zoom, animState.lightTime, lightDir);
  });

  return (
    <div style={introContainerStyle}>
      <canvas ref={webgpuCanvasRef} style={canvasStyle} />
      <div style={overlayStyle}>
        <h1 style={titleStyle}>Tribe2</h1>
        <button
          style={{ ...buttonStyle, ...(isHovered ? buttonHoverStyle : {}) }}
          onClick={() => setAppState('game')}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          Start Game
        </button>
      </div>
    </div>
  );
};
