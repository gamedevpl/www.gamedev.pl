import { GameWorldState } from '../world-types';
import { VisualEffectType } from './visual-effect-types';
import { BuildingType } from '../entities/buildings/building-consts';
import { BuildingEntity } from '../entities/buildings/building-types';
import { addVisualEffect } from '../utils/visual-effects-utils';

// Duration of bonfire effects in game hours - short duration so they refresh frequently
const BONFIRE_EFFECT_DURATION = 0.05;

/**
 * Updates all visual effects in the game state, removing any that have expired.
 * Also spawns continuous effects for active bonfires.
 * @param gameState The current state of the game world.
 */
export function visualEffectsUpdate(gameState: GameWorldState): void {
  gameState.visualEffects = gameState.visualEffects.filter((effect) => {
    const elapsedTime = gameState.time - effect.startTime;
    return elapsedTime <= effect.duration;
  });

  // Spawn fire and smoke effects for active bonfires (only if entities exist)
  if (!gameState.entities?.entities) return;

  for (const entityId in gameState.entities.entities) {
    const entity = gameState.entities.entities[entityId];
    if (entity.type !== 'building') continue;

    const building = entity as BuildingEntity;
    if (
      building.buildingType === BuildingType.Bonfire &&
      building.isConstructed &&
      !building.isBeingDestroyed &&
      (building.fuelLevel ?? 0) > 0
    ) {
      // Check existing effects for this bonfire in a single pass
      let hasFireEffect = false;
      let hasSmokeEffect = false;
      for (const effect of gameState.visualEffects) {
        if (effect.entityId === building.id) {
          if (effect.type === VisualEffectType.BonfireFire) hasFireEffect = true;
          if (effect.type === VisualEffectType.BonfireSmoke) hasSmokeEffect = true;
          if (hasFireEffect && hasSmokeEffect) break;
        }
      }

      if (!hasFireEffect) {
        // Add new fire effect
        addVisualEffect(
          gameState,
          VisualEffectType.BonfireFire,
          { ...building.position },
          BONFIRE_EFFECT_DURATION,
          building.id,
        );
      }

      if (!hasSmokeEffect) {
        // Add new smoke effect
        addVisualEffect(
          gameState,
          VisualEffectType.BonfireSmoke,
          { ...building.position },
          BONFIRE_EFFECT_DURATION,
          building.id,
        );
      }
    }
  }
}
