import { useCustomEvent } from '../events';
import { EntityType, Explosion, Missile, WorldState } from '../world/world-state-types';
import { usePointer } from './pointer';
import { useSelectedObject } from './selection';

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

    const missile: Missile = {
      id: Math.random() + '',
      launch: selectedObject.position,
      launchTimestamp: worldState.timestamp,

      target: pointer.pointingObjects[0].position,
      targetTimestamp: worldState.timestamp + 10,
    };

    const explosion: Explosion = {
      id: Math.random() + '',
      startTimestamp: missile.targetTimestamp,
      endTimestamp: missile.targetTimestamp + 5,
      position: missile.target,
      radius: 30,
    };

    setWorldState({
      ...worldState,
      missiles: [...worldState.missiles, missile],
      explosions: [...worldState.explosions, explosion],
    });
  });

  return null;
}
