import { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, GameStateComponent } from './types';
import styled from 'styled-components';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const TechNukeComponent: GameStateComponent = ({ setGameState }) => {
  const [time, setTime] = useState<number>(1);

  return (
    <Container>
      <Controls>
        <input
          type="range"
          id="volume"
          name="volume"
          min="0"
          max="1"
          step="any"
          value={time}
          onChange={(event) => setTime(Number(event.target.value))}
        />
        <br />
        Time: {time.toFixed(3)}
      </Controls>
      <Canvas>
        <Explosion time={time} />
      </Canvas>
    </Container>
  );
};

function Explosion({ time }: { time: number }) {
  const points = useMemo(() => {
    const points = new THREE.EllipseCurve(0, 0, 1 * time, 1.15 * time, 0, 2 * Math.PI, false, 0).getPoints(50);
    return new Float32Array(points.map((v) => [v.x, v.y, 0]).flat());
  }, [time]);

  const { invalidate } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    invalidate();
    ref.current!.geometry.attributes.position.needsUpdate = true;
  }, [time]);

  return (
    <mesh ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={points.length / 3} array={points} itemSize={3} />
      </bufferGeometry>
      {/* <bufferAttribute attach="attributes-position" count={points.length / 3} array={points} itemSize={3} /> */}
      <meshBasicMaterial color="royalblue" />
    </mesh>
  );
}

const Container = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
`;

const Controls = styled.div`
  text-align: left;
  background: #eee;
  padding: 5px 10px;
`;

export const GameStateTechNuke: GameState = {
  Component: TechNukeComponent,
  path: '/tech-nuke',
};
