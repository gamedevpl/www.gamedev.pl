import type { ToolDefinition } from 'genaicode';

// A tool, so the forced call can only name the declared set.
export const REPLY_TOOL: ToolDefinition = {
  name: 'reply',
  description:
    'Answer in text. This is the default: use it for greetings, questions, small talk, ' +
    'clarifications, and anything you are unsure about.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: "The answer, in the creator's language." },
    },
    required: ['text'],
    additionalProperties: false,
  },
};
