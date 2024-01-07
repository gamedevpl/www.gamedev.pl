import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraShake, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GameState, GameStateComponent } from './types';

const MAP_WIDTH_TILES = 100;
const MAP_HEIGHT_TILES = 100;

const TILE_SIZE = 0.25;

const TILES = Array.from({ length: MAP_WIDTH_TILES })
  .map((v, x) => Array.from({ length: MAP_HEIGHT_TILES }).map((v, y) => ({ x: x * TILE_SIZE, y: y * TILE_SIZE })))
  .flat();

const TechMapComponent: GameStateComponent = ({ setGameState }) => {
  return (
    <MapContainer>
      <Canvas>
        <ambientLight intensity={Math.PI / 2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
        <MapTiles />
        <OrbitControls makeDefault />
        <CameraShake
          maxYaw={0.1} // Max amount camera can yaw in either direction
          maxPitch={0.1} // Max amount camera can pitch in either direction
          maxRoll={0.1} // Max amount camera can roll in either direction
          yawFrequency={0.1} // Frequency of the the yaw rotation
          pitchFrequency={0.1} // Frequency of the pitch rotation
          rollFrequency={0.1} // Frequency of the roll rotation
          intensity={1} // initial intensity of the shake
          decayRate={0.65} // if decay = true this is the rate at which intensity will reduce at />
        />
      </Canvas>
    </MapContainer>
  );
};

function MapTiles() {
  const [positions] = useState(
    () =>
      new Float32Array(
        TILES.map((tile, index) => {
          const z = Math.cos((index / TILES.length) * Math.PI) * TILE_SIZE * 10;

          return [
            [tile.x, tile.y, z], // v0
            [tile.x + TILE_SIZE, tile.y, z], // v1
            [tile.x + TILE_SIZE, tile.y + TILE_SIZE, z], // v2

            [tile.x + TILE_SIZE, tile.y + TILE_SIZE, z], // v3
            [tile.x, tile.y + TILE_SIZE, z], // v4
            [tile.x, tile.y, z], // v5
          ];
        })
          .flat()
          .flat(),
      ),
  );

  new THREE.Color();

  const [colors] = useState(
    () =>
      new Float32Array(
        TILES.map((tile, index) => [
          [0, 1, 0],
          new THREE.Color(0xff0000).toArray(),
          new THREE.Color(0xff0000).toArray(),
          new THREE.Color(0xff0000).toArray(),
          new THREE.Color(0xff0000).toArray(),
          new THREE.Color(0xff0000).toArray(),
        ])
          .flat()
          .flat(),
      ),
  );

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
      </bufferGeometry>
      <meshBasicMaterial vertexColors />
    </mesh>
  );
}

const MapContainer = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
`;

export const GameStateTechMap: GameState = {
  Component: TechMapComponent,
  path: '/tech-map',
};
