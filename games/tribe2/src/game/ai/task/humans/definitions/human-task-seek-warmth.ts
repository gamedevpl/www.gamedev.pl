import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { COLD_THRESHOLD, BONFIRE_HEAT_RADIUS } from '../../../../temperature/temperature-consts';
import { getTemperatureAt } from '../../../../temperature/temperature-update';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { Vector2D } from '../../../../utils/math-types';
import { getDaylightFactor } from '../../../../utils/time-utils';

/**
 * Human task definition for seeking warmth at a bonfire.
 */
export const humanSeekWarmthDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanSeekWarmth,
  requireAdult: false,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    if (getDaylightFactor(context.gameState.time) > 0.5) {
      return null;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (
      !building ||
      building.buildingType !== BuildingType.Bonfire ||
      !building.isConstructed ||
      (building.fuelLevel ?? 0) <= 0
    ) {
      return null;
    }

    // Must belong to the same tribe
    if (human.leaderId !== building.ownerId) {
      return null;
    }

    const temp = getTemperatureAt(
      context.gameState.temperature,
      human.position,
      context.gameState.time,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Comfort zone: don't seek warmth if it's already warm enough (Comfort threshold = COLD_THRESHOLD + 5)
    const comfortThreshold = COLD_THRESHOLD + 5;
    if (temp >= comfortThreshold) {
      return null;
    }

    // Base score: higher as it gets colder
    // (comfortThreshold - temp) / 15 gives ~1.0 when it's 15 degrees below comfort
    const coldnessFactor = (comfortThreshold - temp) / 15;

    // Health urgency: higher as health gets lower (0 to 0.8)
    const healthUrgency = (1 - human.hitpoints / human.maxHitpoints) * 0.8;

    // Distance factor: closer bonfires are better
    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const distanceFactor = getDistanceScore(distance);

    let score = (coldnessFactor + healthUrgency + distanceFactor) / 2;

    // Critical survival boost: if freezing and low health, prioritize this above almost anything
    if (human.hitpoints / human.maxHitpoints < 0.2 && temp < COLD_THRESHOLD) {
      score = Math.max(score, 1.2);
    }

    return score;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return TaskResult.Failure;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (
      !building ||
      building.buildingType !== BuildingType.Bonfire ||
      !building.isConstructed ||
      (building.fuelLevel ?? 0) <= 0
    ) {
      return TaskResult.Failure;
    }

    const temp = getTemperatureAt(
      context.gameState.temperature,
      human.position,
      context.gameState.time,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Comfort zone: don't seek warmth if it's already warm enough (Comfort threshold = COLD_THRESHOLD + 5)
    const comfortThreshold = COLD_THRESHOLD + 5;
    if (temp >= comfortThreshold) {
      return [TaskResult.Success, 'Comfortable temperature reached'];
    }

    // Calculate personal spot around the bonfire to prevent clustering
    // Use entity ID to derive a stable angle
    const angle = ((human.id * 137) % 360) * (Math.PI / 180);
    const radius = BONFIRE_HEAT_RADIUS * 0.4;

    const worldWidth = context.gameState.mapDimensions.width;
    const worldHeight = context.gameState.mapDimensions.height;

    const personalSpot: Vector2D = {
      x: (building.position.x + Math.cos(angle) * radius + worldWidth) % worldWidth,
      y: (building.position.y + Math.sin(angle) * radius + worldHeight) % worldHeight,
    };

    const distanceToSpot = calculateWrappedDistance(human.position, personalSpot, worldWidth, worldHeight);

    if (distanceToSpot > 10) {
      human.activeAction = 'moving';
      human.target = personalSpot;
      human.direction = dirToTarget(human.position, personalSpot, context.gameState.mapDimensions);
      return [TaskResult.Running, `Moving to warmth spot (${distanceToSpot.toFixed(0)}px away)`];
    } else {
      // Stay near the fire at personal spot
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.target = undefined;
      return [TaskResult.Running, 'Staying warm at bonfire'];
    }
  },
});
