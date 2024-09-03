import { BattleState, CharacterState, CharacterAction, GameInput, Position, Rotation } from './battle-types';
import { PhysicsEngine } from '../physics/physics-engine';
import { ARENA_SIZE, CHARACTER_HEIGHT } from '../shared/geometry-definitions';

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

export function updateBattle(battleState: BattleState, timeDelta: number, inputs: GameInput[]): BattleState {
  const updatedCharacters = battleState.characters.map((character, index) => {
    const characterInput = inputs.find((input) => input.playerIndex === index);
    return updateCharacter(character, characterInput?.input.action, index, timeDelta);
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
  input: CharacterAction | undefined,
  index: number,
  timeDelta: number,
): CharacterState {
  const physicsObject = physicsEngine.getCharacterPhysics(index);
  let velocity = physicsObject.velocity;
  const rotation = physicsObject.rotation;

  if (input !== undefined) {
    const forward = calculateForwardVector(rotation);
    const right = calculateRightVector(rotation);

    switch (input) {
      case CharacterAction.MOVE_FORWARD:
        velocity.x += forward.x * MOVE_SPEED * timeDelta;
        velocity.z += forward.z * MOVE_SPEED * timeDelta;
        break;
      case CharacterAction.MOVE_BACKWARD:
        velocity.x -= forward.x * MOVE_SPEED * timeDelta;
        velocity.z -= forward.z * MOVE_SPEED * timeDelta;
        break;
      case CharacterAction.MOVE_LEFT:
        velocity.x -= right.x * MOVE_SPEED * timeDelta;
        velocity.z -= right.z * MOVE_SPEED * timeDelta;
        break;
      case CharacterAction.MOVE_RIGHT:
        velocity.x += right.x * MOVE_SPEED * timeDelta;
        velocity.z += right.z * MOVE_SPEED * timeDelta;
        break;
      case CharacterAction.JUMP:
        if (physicsEngine.isCharacterGrounded(index)) {
          velocity.y = JUMP_FORCE;
        }
        break;
      case CharacterAction.ROTATE_LEFT:
        physicsEngine.setCharacterAngularVelocity(index, { x: 0, y: -Math.PI, z: 0 });
        break;
      case CharacterAction.ROTATE_RIGHT:
        physicsEngine.setCharacterAngularVelocity(index, { x: 0, y: Math.PI * timeDelta, z: 0 });
        break;
      case CharacterAction.ATTACK:
        character.isAttacking = true;
        break;
      case CharacterAction.BLOCK:
        character.isBlocking = true;
        break;
    }
  }

  physicsEngine.setCharacterVelocity(index, velocity);

  return {
    ...character,
    isJumping: !physicsEngine.isCharacterGrounded(index),
    isAttacking: input === CharacterAction.ATTACK ? true : false,
    isBlocking: input === CharacterAction.BLOCK ? true : false,
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

function calculateForwardVector(rotation: Rotation): Position {
  return {
    x: Math.sin(rotation.y),
    y: 0,
    z: Math.cos(rotation.y),
  };
}

function calculateRightVector(rotation: Rotation): Position {
  return {
    x: Math.cos(rotation.y),
    y: 0,
    z: -Math.sin(rotation.y),
  };
}
