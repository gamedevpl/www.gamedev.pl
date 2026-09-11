import type { FastifyInstance } from 'fastify';
import { cliSurfaceEnabled } from '../platform/cli-surface.js';
import { REFERENCE_IMAGES_BODY_LIMIT_BYTES } from './feedback-request.js';
import {
  handleCreatorFeedback,
  handleCreatorTurnsGet,
  type FeedbackRoutesOptions,
} from './creator-feedback-handler.js';

export type { FeedbackRoutesOptions };

export function registerFeedbackRoutes(app: FastifyInstance, options: FeedbackRoutesOptions): void {
  const rateLimit = { max: options.maxFeedbackPerWindow, timeWindow: options.feedbackRateLimitWindowMs };
  const feedbackConfig = {
    bodyLimit: REFERENCE_IMAGES_BODY_LIMIT_BYTES,
    config: { rateLimit },
  };
  const turnConfig = {
    bodyLimit: REFERENCE_IMAGES_BODY_LIMIT_BYTES,
    config: { rateLimit: { ...rateLimit, allowList: () => !cliSurfaceEnabled() } },
  };

  app.post('/api/submissions/:token/feedback', feedbackConfig, (request, reply) =>
    handleCreatorFeedback(options, request, reply, 'feedback'),
  );
  app.post('/api/submissions/:token/turn', turnConfig, (request, reply) =>
    handleCreatorFeedback(options, request, reply, 'turn'),
  );
  app.get('/api/submissions/:token/turns', { config: turnConfig.config }, (request, reply) =>
    handleCreatorTurnsGet(options, request, reply),
  );
}
