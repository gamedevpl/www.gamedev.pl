import React, { useRef, useEffect, useState } from 'react';
import { useRafLoop } from 'react-use';
import { useGameContext } from '../context/game-context';
import { generateHeightMap } from '../game/game-factory';
import { renderHeightMap } from '../game/renderer/renderer';
import { GameWorldState } from '../game/types/game-types';
import { BACKGROUND_COLOR, HEIGHT_MAP_RESOLUTION, MAP_HEIGHT, MAP_WIDTH } from '../game/game-consts';
import { Vector2D } from '../game/types/math-types';

// --- Styles (copied from app.tsx for consistency) ---

const introContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: BACKGROUND_COLOR,
};

const canvasStyle: React.CSSProperties = {
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

// --- Component ---

export const IntroScreen: React.FC = () => {
  const { setAppState } = useGameContext();
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const heightMapRef = useRef<number[][] | null>(null);
  const viewportCenterRef = useRef<Vector2D>({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });

  // Initialize canvas and generate height map on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      ctxRef.current = canvas.getContext('2d');
      heightMapRef.current = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);

      const handleResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Animation loop
  useRafLoop((time) => {
    const ctx = ctxRef.current;
    const heightMap = heightMapRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !heightMap || !canvas) return;

    // Create a gentle, looping wander effect for the viewport
    const wanderSpeed = 0.00005;
    const wanderRadius = MAP_WIDTH / 4;
    viewportCenterRef.current = {
      x: MAP_WIDTH / 2 + Math.cos(time * wanderSpeed) * wanderRadius,
      y: MAP_HEIGHT / 2 + Math.sin(time * wanderSpeed * 1.5) * wanderRadius,
    };

    // Construct a minimal game state object for the renderer
    const pseudoGameState: Pick<GameWorldState, 'heightMap' | 'mapDimensions'> = {
      heightMap,
      mapDimensions: { width: MAP_WIDTH, height: MAP_HEIGHT },
    };

    // Clear canvas before rendering
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Translate canvas to center the viewport
    ctx.translate(
      canvas.width / 2 - viewportCenterRef.current.x,
      canvas.height / 2 - viewportCenterRef.current.y,
    );
    renderHeightMap(ctx, pseudoGameState as GameWorldState, viewportCenterRef.current, {
      width: canvas.width,
      height: canvas.height,
    });
    ctx.restore();
  });

  return (
    <div style={introContainerStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
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
