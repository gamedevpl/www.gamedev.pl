import { playEffect, SoundEffect } from '../../../sound/sound-engine';
import { GameState, LevelConfig, Position } from '../gameplay-types';
import { spawnMonster } from '../logic/monster-spawn';
import { spawnDynamicBonus } from '../logic/bonus-logic';
import { createMonster } from './level-generator';

export function simpleLevelUpdater(gameState: GameState, levelConfig: LevelConfig) {
  if (gameState.monsterSpawnSteps >= 13) {
    const newMonster = spawnMonster(gameState, levelConfig);
    if (newMonster) {
      gameState.monsters.push(newMonster);
      gameState.monsterSpawnSteps = 0;
      playEffect(SoundEffect.MonsterSpawn);
    }
  }
}

const MIN_DISTANCE_FROM_PLAYER = 5;

export function updateDynamicLevel(state: GameState, levelConfig: LevelConfig): void {
  // Spawn a new monster every 13 steps
  if (state.steps % 13 === 0) {
    let pos;
    do {
      pos = getRandomPosition(levelConfig.gridSize);
    } while (!isPositionValid(pos, state) || distanceBetween(pos, state.player.position) < MIN_DISTANCE_FROM_PLAYER);
    state.monsters.push(createMonster(pos.x, pos.y));

    // Spawn a new bonus alongside the monster
    spawnDynamicBonus(state, levelConfig);
  }
}

function getRandomPosition(gridSize: number): Position {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: Math.floor(Math.random() * gridSize),
  };
}

function distanceBetween(pos1: Position, pos2: Position): number {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

function isPositionValid(pos: Position, state: GameState): boolean {
  return (
    !state.obstacles.some((obs) => obs.position.x === pos.x && obs.position.y === pos.y) &&
    !state.monsters.some((monster) => monster.position.x === pos.x && monster.position.y === pos.y) &&
    !state.bonuses.some((bonus) => bonus.position.x === pos.x && bonus.position.y === pos.y) &&
    pos.x !== state.player.position.x &&
    pos.y !== state.player.position.y &&
    pos.x !== state.goal.x &&
    pos.y !== state.goal.y
  );
}
