import { BattleState, CharacterState, CharacterAction, GameInput, Position } from './battle-types';
import { PhysicsEngine } from '../physics/physics-engine';
import { ARENA_SIZE, CHARACTER_HEIGHT } from '../renderer/geometry-definitions';

const MOVE_SPEED = 2;
const JUMP_FORCE = 5;
const GRAVITY = -9.81;

let physicsEngine: PhysicsEngine;

export async function initializeBattleState(): Promise<BattleState> {
  const arenaState = {
    width: ARENA_SIZE,
    height: ARENA_SIZE,
  };

  physicsEngine = new PhysicsEngine(GRAVITY);

  const initialCharacters = [
    createCharacter({ x: -2, y: CHARACTER_HEIGHT / 2, z: 0 }),
    createCharacter({ x: 2, y: CHARACTER_HEIGHT / 2, z: 0 }),
  ];

  initialCharacters.forEach((character) => {
    physicsEngine.createCharacter(character);
  });

  return {
    characters: initialCharacters,
    arenaState,
    gameTime: 0,
  };
}

export function updateBattle(battleState: BattleState, timeDelta: number, characterInput: GameInput): BattleState {
  const updatedCharacters = battleState.characters.map((character, index) => {
    return index === characterInput.playerIndex
      ? updateCharacter(character, characterInput.input.actionEnabled, index, timeDelta)
      : character;
  });

  physicsEngine.step(timeDelta);

  const physicsState = physicsEngine.getState();
  updatedCharacters.forEach((character, index) => {
    const physicsObject = physicsState.characters[index];
    character.position = physicsObject.position;
    character.rotation = physicsObject.rotation;
  });

  return {
    ...battleState,
    characters: updatedCharacters,
    gameTime: battleState.gameTime + timeDelta,
  };
}

function updateCharacter(
  character: CharacterState,
  input: Partial<Record<CharacterAction, boolean | undefined>>,
  index: number,
  timeDelta: number,
): CharacterState {
  let velocity = { x: 0, y: 0, z: 0 };

  if (input[CharacterAction.MOVE_UP]) {
    velocity.z = -MOVE_SPEED;
  }
  if (input[CharacterAction.MOVE_DOWN]) {
    velocity.z = MOVE_SPEED;
  }
  if (input[CharacterAction.MOVE_LEFT]) {
    velocity.x = -MOVE_SPEED;
  }
  if (input[CharacterAction.MOVE_RIGHT]) {
    velocity.x = MOVE_SPEED;
  }
  if (input[CharacterAction.JUMP]) {
    if (physicsEngine.isCharacterGrounded(index)) {
      velocity.y = JUMP_FORCE;
    }
  }
  if (input[CharacterAction.ROTATE_LEFT]) {
    physicsEngine.setCharacterAngularVelocity(index, { x: 0, y: -Math.PI * timeDelta, z: 0 });
  }
  if (input[CharacterAction.ROTATE_RIGHT]) {
    physicsEngine.setCharacterAngularVelocity(index, { x: 0, y: Math.PI * timeDelta, z: 0 });
  }
  if (input[CharacterAction.ATTACK]) {
    character.isAttacking = true;
  }
  if (input[CharacterAction.BLOCK]) {
    character.isBlocking = true;
  }

  physicsEngine.setCharacterVelocity(index, velocity);

  return {
    ...character,
    isJumping: !physicsEngine.isCharacterGrounded(index),
    isAttacking: input[CharacterAction.ATTACK] ?? false,
    isBlocking: input[CharacterAction.BLOCK] ?? false,
  };
}

function createCharacter(position: Position): CharacterState {
  return {
    position,
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    isJumping: false,
    isAttacking: false,
    isBlocking: false,
    equipment: {
      armor: 0,
      helmet: false,
      shield: false,
      sword: true,
    },
  };
}
