/**
 * Defines the data structures for the ecosystem balancer.
 */

export interface EcosystemState {
  lastUpdateTime?: number; // Timestamp of the last ecosystem update

  // Prey reproduction parameters
  preyGestationPeriod: number;
  preyProcreationCooldown: number;

  // Predator reproduction parameters
  predatorGestationPeriod: number;
  predatorProcreationCooldown: number;

  // Prey hunger parameters
  preyHungerIncreasePerHour: number;

  // Predator hunger parameters
  predatorHungerIncreasePerHour: number;

  // Bush spread parameters
  berryBushSpreadChance: number;
}
