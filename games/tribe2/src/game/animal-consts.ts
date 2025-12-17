// Animal Constants

// Prey Constants
export const PREY_MAX_AGE_YEARS: number = 12; // Maximum lifespan in game years
export const PREY_HUNGER_DEATH: number = 120; // Lower hunger threshold than humans
export const PREY_MAX_HITPOINTS: number = 50; // Lower health than humans
export const PREY_BASE_SPEED: number = 12; // Faster than humans
export const PREY_INITIAL_HUNGER: number = 30;
export const PREY_INITIAL_AGE: number = 2;
export const PREY_INTERACTION_RANGE: number = 50; // Increased range for better interactions

// Player interaction ranges for animal hunting/defending
export const PREY_FLEE_DISTANCE: number = 100;
export const PREY_MIN_PROCREATION_AGE: number = 2;
export const PREY_MAX_PROCREATION_AGE: number = 8; // Extended from 3 to allow more breeding opportunities
export const PREY_EATING_COOLDOWN_HOURS: number = 0.9;
export const PREY_BERRY_BUSH_DAMAGE: number = 1; // Reduces berry bush lifespan
export const PREY_HUNGER_THRESHOLD_SLOW: number = 50; // When prey start moving slower
export const PREY_SLOW_SPEED_MODIFIER: number = 0.5; // Speed reduction when hungry

// Predator Constants
export const PREDATOR_MAX_AGE_YEARS: number = 20; // Longer lifespan than prey
export const PREDATOR_HUNGER_DEATH: number = 140; // Higher than prey, lower than humans
export const PREDATOR_MAX_HITPOINTS: number = 40;
export const PREDATOR_BASE_SPEED: number = 12; // Slightly faster than humans
export const PREDATOR_INITIAL_HUNGER: number = 40;
export const PREDATOR_INITIAL_AGE: number = 3;
export const PREDATOR_INTERACTION_RANGE: number = 60; // Increased range for better interactions
export const PREDATOR_ATTACK_RANGE: number = 40;
export const PREDATOR_HUNT_RANGE: number = 50;
export const PREDATOR_TERRITORIAL_RANGE: number = 320; // Range for detecting territorial rivals
export const PREDATOR_ATTACK_DAMAGE: number = 25;
export const PREDATOR_HUNT_DAMAGE: number = 60; // Even higher for hunting prey
export const PREDATOR_ATTACK_COOLDOWN_HOURS: number = 2;
export const PREDATOR_HUNGER_THRESHOLD_SLOW: number = 90; // When predators start moving slower
export const PREDATOR_SLOW_SPEED_MODIFIER: number = 0.7; // Speed reduction when hungry
export const PREDATOR_HUNT_COOLDOWN_HOURS: number = 1;
export const PREDATOR_MIN_PROCREATION_AGE: number = 3;
export const PREDATOR_MAX_PROCREATION_AGE: number = 15;
export const PREDATOR_MEAT_HUNGER_REDUCTION: number = 80; // How much hunger is reduced by eating meat

// Animal Spawning Constants
export const INITIAL_PREY_COUNT: number = 10;

// Animal Feeding Constants (only females can feed children)
export const ANIMAL_CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD: number = 80; // Higher than humans since animals use different hunger scale
export const ANIMAL_PARENT_FEEDING_RANGE: number = 40; // Slightly smaller than humans
export const ANIMAL_FEED_CHILD_COOLDOWN_HOURS: number = 2; // How long parent must wait between feedings
export const ANIMAL_CHILD_FEEDING_HUNGER_REDUCTION: number = 30; // How much hunger is reduced when fed by parent

// Ecosystem Animal Parameters
export const MIN_PREY_GESTATION_PERIOD = 20; // in game hours
export const MAX_PREY_GESTATION_PERIOD = 40; // in game hours
export const MIN_PREY_PROCREATION_COOLDOWN = 24; // in game hours
export const MAX_PREY_PROCREATION_COOLDOWN = 48; // in game hours

export const MIN_PREDATOR_GESTATION_PERIOD = 12; // in game hours
export const MAX_PREDATOR_GESTATION_PERIOD = 40; // in game hours
export const MIN_PREDATOR_PROCREATION_COOLDOWN = 20; // in game hours
export const MAX_PREDATOR_PROCREATION_COOLDOWN = 60; // in game hours

export const MIN_PREY_HUNGER_INCREASE_PER_HOUR = 0.75;
export const MAX_PREY_HUNGER_INCREASE_PER_HOUR = 2.5;
export const MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR = 0.25;
export const MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR = 2.0;
