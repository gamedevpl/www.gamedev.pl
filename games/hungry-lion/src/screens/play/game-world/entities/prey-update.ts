import { getSectorAtEntity } from '../environment/environment-query';
import { GrassSector } from '../environment/environment-types';
import { UpdateContext } from '../game-world-types';
import { Entity, Entities, PreyEntity, CarrionEntity } from './entities-types';
import { createEntity } from './entities-update';

export function preyUpdate(entity: Entity, updateContext: UpdateContext, state: Entities) {
  const prey = entity as PreyEntity;

  // update hunger and thirst levels
  prey.hungerLevel = Math.max(prey.hungerLevel - 0.001 * updateContext.deltaTime, 0);
  prey.thirstLevel = Math.max(prey.thirstLevel - 0.001 * updateContext.deltaTime, 0);

  // hungry or thirsty reduces health
  if (prey.hungerLevel <= 0 || prey.thirstLevel <= 0) {
    prey.health -= 0.001 * updateContext.deltaTime;
  }

  // if state eating, and on grass sector, consume grass, increase health
  if (prey.state === 'eating' && prey.hungerLevel < 100) {
    const grassSector = getSectorAtEntity<GrassSector>(updateContext.gameState.environment, prey, 'grass');
    if (grassSector && grassSector.density > 0) {
      prey.hungerLevel += 0.15 * updateContext.deltaTime;
      prey.health += 0.01 * updateContext.deltaTime;
      grassSector.density -= 0.001 * updateContext.deltaTime;
    }
  }

  // if state drinking, and on water sector, drink water, increase health
  if (prey.state === 'drinking' && prey.thirstLevel < 100) {
    const waterSector = getSectorAtEntity(updateContext.gameState.environment, prey, 'water');
    if (waterSector) {
      prey.thirstLevel += 0.15 * updateContext.deltaTime;
      prey.health += 0.01 * updateContext.deltaTime;
    }
  }

  if (prey.state === 'fleeing') {
    prey.staminaLevel = Math.max(prey.staminaLevel - 0.01 * updateContext.deltaTime, 0);
  } else {
    prey.staminaLevel = Math.min(prey.staminaLevel + 0.01 * updateContext.deltaTime, 100);
  }

  if (prey.health <= 0) {
    state.entities.delete(prey.id);
    createEntity<CarrionEntity>(state, 'carrion', {
      position: prey.position,
      direction: prey.direction,
      food: 100,
      decay: 100,
    });
  }
}
