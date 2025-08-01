/**
 * Defines the data structures for the ecosystem balancer.
 */

export interface EcosystemState {
  // Prey reproduction parameters
  preyGestationPeriod: number;
  preyProcreationCooldown: number;

  // Predator reproduction parameters
  predatorGestationPeriod: number;
  predatorProcreationCooldown: number;
}
