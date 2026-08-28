import type { FastifyInstance } from 'fastify';
import { REFERENCE_IMAGES_BODY_LIMIT_BYTES } from './feedback-request.js';
import {
  handleCreatorFeedback,
  handleCreatorTurnsGet,
  type FeedbackRoutesOptions,
} from './creator-feedback-handler.js';

export type { FeedbackRoutesOptions };

export function registerFeedbackRoutes(app: FastifyInstance, options: FeedbackRoutesOptions): void {
  const postConfig = {
    bodyLimit: REFERENCE_IMAGES_BODY_LIMIT_BYTES,
    config: { rateLimit: { max: options.maxFeedbackPerWindow, timeWindow: options.feedbackRateLimitWindowMs } },
  };

  app.post('/api/submissions/:token/feedback', postConfig, (request, reply) =>
    handleCreatorFeedback(options, request, reply, 'feedback'),
  );
  app.post('/api/submissions/:token/turn', postConfig, (request, reply) =>
    handleCreatorFeedback(options, request, reply, 'turn'),
  );
  app.get('/api/submissions/:token/turns', (request, reply) => handleCreatorTurnsGet(options, request, reply));
}
