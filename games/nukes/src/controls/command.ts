import { useCustomEvent } from '../events';
import { EntityType, Explosion, Missile, WorldState } from '../world/world-state-types';
import { distance } from '../math/position-utils';
import { usePointer } from './pointer';
import { useSelectedObject } from './selection';
import { EXPLOSION_RADIUS, EXPLOSION_DURATION, MISSILE_SPEED } from '../world/world-state-constants';

export function Command({
  worldState,
  setWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  const selectedObject = useSelectedObject();
  const pointer = usePointer();

  useCustomEvent('world-click', () => {
    if (selectedObject?.type !== EntityType.LAUNCH_SITE || pointer.pointingObjects.length === 0) {
      return;
    }

    const dist = distance(
      selectedObject.position.x,
      selectedObject.position.y,
      pointer.pointingObjects[0].position.x,
      pointer.pointingObjects[0].position.y,
    );

    const missile: Missile = {
      id: Math.random() + '',
      launch: selectedObject.position,
      launchTimestamp: worldState.timestamp,

      target: pointer.pointingObjects[0].position,
      targetTimestamp: worldState.timestamp + dist / MISSILE_SPEED,
    };

    const explosion: Explosion = {
      id: Math.random() + '',
      missileId: missile.id,
      startTimestamp: missile.targetTimestamp,
      endTimestamp: missile.targetTimestamp + EXPLOSION_DURATION,
      position: missile.target,
      radius: EXPLOSION_RADIUS,
    };

    setWorldState({
      ...worldState,
      missiles: [...worldState.missiles, missile],
      explosions: [...worldState.explosions, explosion],
    });
  });

  return null;
}
