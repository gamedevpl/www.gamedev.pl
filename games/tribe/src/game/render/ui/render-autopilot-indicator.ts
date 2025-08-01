import { Entity } from '../../entities/entities-types';
import { PLAYER_ACTION_EMOJIS, PLAYER_ACTION_NAMES, PlayerActionType } from '../../ui/ui-types';
import { Vector2D } from '../../utils/math-types';
import {
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
  UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
} from '../../world-consts';
import { GameWorldState } from '../../world-types';
import { findPlayerEntity } from '../../utils';
import { renderWithWrapping } from '../render-utils';
import { VisualEffect } from '../../visual-effects/visual-effect-types';

function drawIndicator(
  ctx: CanvasRenderingContext2D,
  screenPos: Vector2D,
  radius: number,
  action: PlayerActionType,
  time: number,
) {
  ctx.save();

  // Pulsing effect for the circle
  const pulse = (Math.sin(time * UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED) + 1) / 2; // a value between 0 and 1
  const circleRadius = radius + PLAYER_ACTION_OUTLINE_RADIUS_OFFSET + pulse * 5;

  // Draw the pulsing circle
  ctx.strokeStyle = PLAYER_ACTION_OUTLINE_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash(PLAYER_ACTION_OUTLINE_DASH_PATTERN);
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw the emoji and text
  const emoji = PLAYER_ACTION_EMOJIS[action];
  const name = PLAYER_ACTION_NAMES[action];
  if (emoji) {
    ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE * 1.5}px "Press Start 2P", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textY = screenPos.y - circleRadius - 25;
    ctx.fillText(emoji, screenPos.x, textY);
    ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillText(name, screenPos.x, textY + 25);
  }

  ctx.restore();
}

function drawRippleEffect(ctx: CanvasRenderingContext2D, screenPos: Vector2D, time: number) {
  ctx.save();
  const rippleSpeed = 30; // radius units per hour
  const maxRadius = 70;
  const numRipples = 3;
  const rippleSeparation = maxRadius / numRipples;

  for (let i = 0; i < numRipples; i++) {
    const offset = i * rippleSeparation;
    const baseRadius = (time * rippleSpeed + offset) % maxRadius;
    const opacity = 1 - baseRadius / maxRadius;

    ctx.strokeStyle = `rgba(255, 215, 0, ${opacity * 0.7})`; // Gold-ish color
    ctx.lineWidth = 1 + (1 - opacity) * 2; // gets thicker as it expands
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, baseRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderAutopilotIndicator(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  const { activeAutopilotAction: activeAction, behaviors } = gameState.autopilotControls;
  const player = findPlayerEntity(gameState);

  if (!player) {
    return;
  }
  const rippleCallback = (context: CanvasRenderingContext2D, ripple: VisualEffect) => {
    drawRippleEffect(context, ripple.position, gameState.time);
  };

  // Render ripple for player's "Follow Me" command
  if (player.isCallingToFollow) {
    renderWithWrapping(ctx, gameState.mapDimensions.width, gameState.mapDimensions.height, rippleCallback, {
      position: player.position,
    } as VisualEffect);
  }

  // Render ripple for AI "Follow Leader" behavior toggle
  // This shows that the tribe is in "follow" mode.
  if (behaviors.followLeader && !activeAction) {
    renderWithWrapping(
      ctx,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      rippleCallback,
      {
        position: player.position,
      } as VisualEffect,
      70,
    );
  }

  // Render indicators for other one-time autopilot actions
  if (activeAction) {
    let targetPosition: Vector2D | undefined;
    let targetRadius = 15; // Default radius for position-based actions

    if ('position' in activeAction) {
      targetPosition = activeAction.position;
    } else if ('targetEntityId' in activeAction) {
      const targetEntity = gameState.entities.entities.get(activeAction.targetEntityId);
      if (targetEntity) {
        targetPosition = targetEntity.position;
        targetRadius = (targetEntity as Entity).radius || 30;
      }
    }

    if (targetPosition) {
      // We don't want to draw the old indicator for follow actions
      if (activeAction.action !== PlayerActionType.AutopilotFollowMe && !player.isCallingToFollow) {
        const indicatorCallback = (context: CanvasRenderingContext2D, effect: VisualEffect) => {
          drawIndicator(context, effect.position, targetRadius, activeAction.action, gameState.time);
        };
        renderWithWrapping(
          ctx,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
          indicatorCallback,
          {
            position: { ...targetPosition },
          } as VisualEffect,
          targetPosition,
          targetRadius + 30,
        );
      }
    }
  }
}
