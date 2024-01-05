import React from 'react';
import { GameState, GameStateComponent } from './types';
import styled from 'styled-components';

const MAP_WIDTH_TILES = 100;
const MAP_HEIGHT_TILES = 100;

const TILE_SIZE = 64;

const TILES = Array.from({ length: MAP_WIDTH_TILES })
  .map((v, x) => Array.from({ length: MAP_HEIGHT_TILES }).map((v, y) => ({ x, y })))
  .flat();

const Intro: GameStateComponent = ({ setGameState }) => {
  return (
    <Map>
      {TILES.map((tile) => (
        <Tile style={{ '--tile-x': tile.x, '--tile-y': tile.y } as React.CSSProperties}>
          [{tile.x},{tile.y}]
        </Tile>
      ))}
    </Map>
  );
};

const Map = styled.div`
  position: absolute;
  transform: rotate(-45deg) skew(15deg, 15deg);
  transform-origin: center;
  transform-style: preserve-3d;
  left: 0px;
`;

const Tile = styled.div`
  position: absolute;
  transform: translate(calc(var(--tile-x) * ${TILE_SIZE}px), calc(var(--tile-y) * ${TILE_SIZE}px));

  width: ${TILE_SIZE}px;
  height: ${TILE_SIZE}px;
  overflow: hidden;

  background: rgb(calc(var(--tile-x) / ${MAP_WIDTH_TILES} * 255), calc(var(--tile-y) / ${MAP_HEIGHT_TILES} * 255), 0);

  &:hover {
    background: yellow;
    cursor: pointer;
  }
`;

export const GameStateTechMap: GameState = {
  Component: Intro,
  path: '/tech-map',
};
