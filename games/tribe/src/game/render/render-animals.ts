import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { renderPrey } from './render-prey';
import { renderPredator } from './render-predator';

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPreyEntity(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  renderPrey(ctx, prey);
}

/**
 * Renders a predator entity using the asset generator sprite system.
 */
export function renderPredatorEntity(ctx: CanvasRenderingContext2D, predator: PredatorEntity): void {
  renderPredator(ctx, predator);
}