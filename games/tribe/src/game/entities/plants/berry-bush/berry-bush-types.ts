import { EntityId } from "../../entities-types";
import { PlantEntity } from "../plant-types";

/**
 * Represents a berry bush entity in the game.
 */
export interface BerryBushEntity extends PlantEntity {
  /** The current number of berries on the bush. */
  currentBerries: number;
  /** The maximum number of berries the bush can hold. */
  maxBerries: number;
  /** The rate at which berries regenerate, in berries per game hour. */
  berryRegenerationRate: number;
  /** Game hours passed since the last berry was regenerated. */
  timeSinceLastBerryRegen: number;
  /** The chance (0.0 to 1.0) that the bush will attempt to spread in a given opportunity. */
  spreadChance: number;
  /** The maximum radius (in pixels) from the parent bush where a new bush can spawn. */
  spreadRadius: number;
  /** Game hours passed since the last spread attempt. */
  timeSinceLastSpreadAttempt: number;
  /** Game time when the bush was last harvested. */
  timeSinceLastHarvest: number;
  /** The ID of the human entity that currently claims the bush. */
  ownerId?: EntityId;
  /** The game time (in hours) until which the bush is claimed. */
  claimedUntil?: number;
}
