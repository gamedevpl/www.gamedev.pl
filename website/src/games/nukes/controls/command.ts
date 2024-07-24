import { useCustomEvent } from "../events";
import { EntityType, WorldState } from "../world/world-state-types";
import { usePointer } from "./pointer";
import { useSelectedObject } from "./selection";
import { distance } from "../math/position-utils";
import { EXPLOSION_RADIUS } from "../world/world-state-constants";

export function Command({
  worldState,
  setWorldState,
}: {
  worldState: WorldState;
  setWorldState: (worldState: WorldState) => void;
}) {
  const selectedObject = useSelectedObject();
  const pointer = usePointer();

  useCustomEvent("world-click", () => {
    if (
      selectedObject?.type !== EntityType.LAUNCH_SITE ||
      pointer.pointingObjects.length === 0
    ) {
      return;
    }

    const targetPosition = pointer.pointingObjects[0].position;

    // Check if target position is too close to any friendly cities or launch sites
    const isTooCloseToFriendly =
      worldState.cities.some(
        (city) =>
          city.stateId === selectedObject.stateId &&
          distance(
            city.position.x,
            city.position.y,
            targetPosition.x,
            targetPosition.y
          ) < EXPLOSION_RADIUS
      ) ||
      worldState.launchSites.some(
        (site) =>
          site.stateId === selectedObject.stateId &&
          distance(
            site.position.x,
            site.position.y,
            targetPosition.x,
            targetPosition.y
          ) < EXPLOSION_RADIUS
      );

    if (!isTooCloseToFriendly) {
      selectedObject.nextLaunchTarget = targetPosition;
    }

    setWorldState({
      ...worldState,
    });
  });

  return null;
}
