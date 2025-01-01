import { PreyState } from './prey-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from './game-world-consts';

export function updatePrey(prey: PreyState, deltaTime: number): PreyState {
  const secondsDelta = deltaTime / 1000;

  if (prey.state === 'idle') {
    // Randomly decide to start moving
    if (Math.random() < 0.01) {
      prey.state = 'moving';
      prey.movement.direction = {
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
      };
      prey.movement.speed = 100;
    }
  } else if (prey.state === 'moving') {
    // Update position based on movement
    prey.position.x += prey.movement.direction.x * prey.movement.speed * secondsDelta;
    prey.position.y += prey.movement.direction.y * prey.movement.speed * secondsDelta;

    // Bounce off edges
    if (prey.position.x < 0 || prey.position.x > GAME_WORLD_WIDTH) {
      prey.movement.direction.x *= -1;
    }
    if (prey.position.y < 0 || prey.position.y > GAME_WORLD_HEIGHT) {
      prey.movement.direction.y *= -1;
    }

    // Randomly decide to stop moving
    if (Math.random() < 0.01) {
      prey.state = 'idle';
      prey.movement.speed = 0;
    }
  }

  return prey;
}
