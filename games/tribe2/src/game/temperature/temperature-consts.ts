/**
 * Constants for the temperature system.
 * Defines sector size, default temperatures, and health impact thresholds.
 */

/** Size of each temperature sector in pixels. */
export const TEMPERATURE_SECTOR_SIZE = 100;

/** Default base temperature for the world in degrees Celsius. */
export const BASE_TEMPERATURE_DEFAULT = 20;

/** Temperature threshold below which humans start losing health (degrees Celsius). */
export const COLD_THRESHOLD = 10;

/** Health points lost per hour for each degree Celsius below the COLD_THRESHOLD. */
export const HEALTH_DRAIN_PER_HOUR_PER_DEGREE_BELOW_THRESHOLD = 0.5;

/** Radius in pixels within which a bonfire emits heat. */
export const BONFIRE_HEAT_RADIUS = 150;

/** Maximum temperature increase at the center of a bonfire (degrees Celsius). */
export const BONFIRE_HEAT_INTENSITY = 25;

/** Amount of fuel consumed by a bonfire per game hour. */
export const BONFIRE_FUEL_CONSUMPTION_PER_HOUR = 0.5;

/** Maximum fuel capacity for a bonfire. */
export const BONFIRE_MAX_FUEL = 100;

/** Amount of fuel added to a bonfire per unit of wood. */
export const BONFIRE_FUEL_PER_WOOD = 25;

/** Fuel level ratio below which a demand for wood is registered for a bonfire. */
export const BONFIRE_REFUEL_THRESHOLD_RATIO = 0.5;

/** Temperature at tribe center below which a leader decides to build a new bonfire. */
export const BONFIRE_PLACEMENT_TEMP_THRESHOLD = 15;

/** Maximum number of wood items a bonfire can hold in its "queue". */
export const BONFIRE_STORAGE_CAPACITY = 4;

/** Fuel level ratio below which the bonfire will consume a wood item from its storage. */
export const BONFIRE_REFUEL_THRESHOLD = 0.75;

/** Maximum temperature variation caused by the day/night cycle. */
export const TEMPERATURE_CYCLE_AMPLITUDE = 15;

/** Maximum number of humans that can gather around a single bonfire. */
export const BONFIRE_MAX_USERS = 8;

/** Number of tribe members per bonfire before a leader considers building another one. */
export const BONFIRE_TRIBE_SIZE_RATIO = 12;

/** Frequency at which the leader checks for fuel levels and registers demands. */
export const BONFIRE_LOGISTICS_CHECK_INTERVAL_HOURS = 0.5;