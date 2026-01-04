import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskResult, TaskType, TaskDefinition } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { getDistanceScore } from '../../task-utils';
import { vectorDistance, vectorSubtract, vectorNormalize, vectorAdd, vectorScale } from '../../../../utils/math-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { PREY_FLEE_DISTANCE } from '../../../../animal-consts';

const FLEE_DETECTION_RADIUS = PREY_FLEE_DISTANCE * 1.5;

export const animalFleeProducer = (
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): Record<string, Task> => {
  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Detect threats
  const threats = [
    ...indexedState.search.human.byRadius(entity.position, FLEE_DETECTION_RADIUS),
    ...indexedState.search.predator.byRadius(entity.position, FLEE_DETECTION_RADIUS),
  ].filter((e) => {
    if (e.id === entity.id) return false;

    if (entity.type === 'prey') {
      // Prey flee from humans and predators
      return e.type === 'human' || e.type === 'predator';
    } else if (entity.type === 'predator') {
      // Predators flee from humans (if they are a threat/player) or rival predators (different gene code/pack)
      if (e.type === 'human') return true;
      if (e.type === 'predator') {
        const other = e as PredatorEntity;
        return other.geneCode !== (entity as PredatorEntity).geneCode;
      }
    }
    return false;
  });

  if (threats.length === 0) return tasks;

  // Find the closest threat
  let closestThreat = threats[0];
  let minDistance = vectorDistance(entity.position, closestThreat.position);

  for (let i = 1; i < threats.length; i++) {
    const dist = vectorDistance(entity.position, threats[i].position);
    if (dist < minDistance) {
      minDistance = dist;
      closestThreat = threats[i];
    }
  }

  const taskId = `animal-flee-${entity.id}-${closestThreat.id}`;
  tasks[taskId] = {
    id: taskId,
    type: TaskType.AnimalFlee,
    position: closestThreat.position,
    creatorEntityId: entity.id,
    target: closestThreat.id,
    validUntilTime: context.gameState.time + 1,
  };

  return tasks;
};

export const animalFleeScorer = (
  entity: PreyEntity | PredatorEntity,
  task: Task,
  context: UpdateContext,
): number | null => {
  const threat = context.gameState.entities.entities[task.target as number];
  if (!threat) return null;

  const distance = vectorDistance(entity.position, threat.position);
  if (distance > FLEE_DETECTION_RADIUS) return null;

  // High priority for close threats
  return getDistanceScore(distance) * 0.95;
};

export const animalFleeExecutor = (
  task: Task,
  entity: PreyEntity | PredatorEntity,
  context: UpdateContext,
): TaskResult => {
  const threat = context.gameState.entities.entities[task.target as number];
  if (!threat) return TaskResult.Failure;

  const distance = vectorDistance(entity.position, threat.position);
  if (distance > FLEE_DETECTION_RADIUS * 1.2) return TaskResult.Success;

  // Calculate flee direction (away from threat)
  const fleeDir = vectorNormalize(vectorSubtract(entity.position, threat.position));
  const fleeTarget = vectorAdd(entity.position, vectorScale(fleeDir, 100));

  // Set state to moving
  entity.activeAction = 'moving';
  entity.target = fleeTarget;

  return TaskResult.Running;
};

export const animalFleeTask: TaskDefinition<PreyEntity | PredatorEntity> = {
  type: TaskType.AnimalFlee,
  producer: animalFleeProducer,
  scorer: animalFleeScorer,
  executor: animalFleeExecutor,
};
