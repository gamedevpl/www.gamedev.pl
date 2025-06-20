import { EntityId } from '../entities/entities-types';

/**
 * Represents the karma relationships of a human.
 * It's a map where the key is the EntityId of another human,
 * and the value is the karma score.
 *
 * - Positive values indicate good will.
 * - Negative values indicate ill will.
 * - Zero or undefined indicates neutrality.
 */
export type Karma = Record<EntityId, number>;
