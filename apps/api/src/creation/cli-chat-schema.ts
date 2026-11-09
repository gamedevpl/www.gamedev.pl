import { z } from 'zod';
import { MAX_REVISION_CHARS } from '../platform/submission-status.js';

export const ChatBodySchema = z.object({
  text: z.string().trim().min(1, 'text is required').max(MAX_REVISION_CHARS, 'text is too long'),
  conversationId: z.string().uuid().optional(),
  prepareOnly: z.boolean().optional(),
  session: z
    .object({
      token: z.string().min(1).max(512).optional(),
      checkoutSlug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100)
        .optional(),
      agents: z.array(z.string().min(1).max(40)).max(20),
      localTasks: z.boolean().optional(),
      pendingMerge: z.enum(['pull', 'stash']).optional(),
    })
    .strict()
    .optional(),
});
