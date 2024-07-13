import { useCustomEvent } from '../events';
import { EntityType, WorldState } from '../world/world-state-types';
import { usePointer } from './pointer';
import { useSelectedObject } from './selection';

export function Command({}: { worldState: WorldState; setWorldState: (worldState: WorldState) => void }) {
  const selectedObject = useSelectedObject();
  const pointer = usePointer();

  useCustomEvent('world-click', () => {
    if (selectedObject?.type !== EntityType.LAUNCH_SITE || pointer.pointingObjects.length === 0) {
      return;
    }

    selectedObject.nextLaunchTarget = pointer.pointingObjects[0].position;
  });

  return null;
}
