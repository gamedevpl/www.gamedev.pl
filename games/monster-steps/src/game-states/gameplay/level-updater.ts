import { soundEngine } from '../../sound/sound-engine';
import { GameState, LevelConfig } from './gameplay-types';
import { spawnMonster } from './monster-spawn';

export function simpleLevelUpdater(gameState: GameState, levelConfig: LevelConfig) {
  if (gameState.monsterSpawnSteps >= 13) {
    const newMonster = spawnMonster(gameState, levelConfig);
    if (newMonster) {
      gameState.monsters.push(newMonster);
      gameState.monsterSpawnSteps = 0;
      soundEngine.playMonsterSpawn();
    }
  }
}
