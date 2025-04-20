import OpenAI from 'openai';
import { PromptItem, Plugin, ModelType, GenerateContentFunction, FunctionDef, GenerateContentResult } from 'genaicode';

const generateContent: GenerateContentFunction = async (
  prompt: PromptItem[],
  { functionDefs, requiredFunctionName, temperature, modelType },
) => {
  const { getServiceConfig } = await import('genaicode/ai-service/service-configurations.js');
  const serviceConfig = getServiceConfig('plugin:deepseek-ai-service');

  const openai = new OpenAI({
    apiKey: serviceConfig.apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  const { internalGenerateContent } = await import('genaicode/ai-service/openai.js');
  const { processFunctionCalls } = await import('genaicode/ai-service/common.js');

  const last = prompt.slice(-1)[0];
  const lastText = last.text;
  if (requiredFunctionName) {
    if (last.type === 'user' && last.text && !last.text.includes('IMPORTANT REQUIREMENT')) {
      /* sometimes it is broken :( */
      last.text += `\n\nIMPORTANT REQUIREMENT: Please respond to me with only one function call. The function called must be \`${requiredFunctionName}\`.`;
    }
  }

  let content: Awaited<ReturnType<typeof internalGenerateContent>>;
  try {
    content = await internalGenerateContent(
      prompt,
      {
        functionDefs,
        requiredFunctionName,
        temperature,
        modelType,
        expectedResponseType: {
          functionCall: true,
          text: false,
          media: false,
        },
      },
      modelType === ModelType.CHEAP
        ? serviceConfig.modelOverrides?.cheap ?? 'deepseek-chat'
        : modelType === ModelType.REASONING
        ? 'deepseek-reasoner'
        : serviceConfig.modelOverrides?.default ?? 'deepseek-chat',
      openai,
    );
  } finally {
    if (lastText) {
      last.text = lastText;
    }
  }

  let toolCalls = content.filter((item) => item.type === 'functionCall').map((item) => item.functionCall);

  if (requiredFunctionName && toolCalls.length > 1) {
    /* sometimes it is broken :( */
    console.log('Multiple function calls, but all are the same, so keeping only one.');
    toolCalls = toolCalls.filter((call) => call.name === requiredFunctionName).slice(0, 1);
  }

  const functionCalls = toolCalls.map((call) => {
    const name =
      call.name /* sometimes it is broken :( */
        .match(/\w+/)?.[0] ?? call.name;
    const args = call.args;

    return {
      id: call.id,
      name,
      args,
    };
  });

  return processFunctionCalls(functionCalls, functionDefs).map((item) => ({
    type: 'functionCall',
    functionCall: item,
  }));
};

export const deepseekAiService: Plugin = {
  name: 'deepseek-ai-service',
  aiServices: {
    'deepseek-ai-service': {
      generateContent,
      serviceConfig: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        openaiBaseUrl: 'https://api.deepseek.com',
        modelOverrides: {
          default: 'deepseek-chat',
          cheap: 'deepseek-chat',
          reasoning: 'deepseek-reasoner',
        },
      },
    },
  },
};

/**
 * This function generates content using the Grok models with the new interface.
 */
const generateContentGrok: GenerateContentFunction = async function generateContent(
  prompt: PromptItem[],
  config: {
    modelType?: ModelType;
    temperature?: number;
    functionDefs?: FunctionDef[];
    requiredFunctionName?: string | null;
    expectedResponseType?: {
      text: boolean;
      functionCall: boolean;
      media: boolean;
    };
  },
): Promise<GenerateContentResult> {
  const { getServiceConfig } = await import('genaicode/ai-service/service-configurations.js');
  const serviceConfig = getServiceConfig('plugin:grok-ai-service');

  const openai = new OpenAI({
    apiKey: serviceConfig.apiKey,
    baseURL: 'https://api.x.ai/v1',
  });

  const { internalGenerateContent } = await import('genaicode/ai-service/openai.js');

  const modelType = config.modelType ?? ModelType.DEFAULT;

  // Determine the model to use based on modelType and service config
  const model =
    modelType === ModelType.CHEAP
      ? serviceConfig.modelOverrides?.cheap ?? 'grok-3-mini-beta'
      : modelType === ModelType.REASONING
      ? serviceConfig.modelOverrides?.reasoning ?? 'grok-3-mini-beta'
      : serviceConfig.modelOverrides?.default ?? 'grok-3-beta';

  // Call internalGenerateContent from openai.ts with the new signature
  return await internalGenerateContent(
    prompt.map((item) => ({ ...item, text: item.text ?? ' ' })),
    config,
    model,
    openai,
  );
};

export const grokAiService: Plugin = {
  name: 'grok-ai-service',
  aiServices: {
    'grok-ai-service': {
      generateContent: generateContentGrok,
      serviceConfig: {
        apiKey: process.env.GROK_OPENAI_API_KEY,
        modelOverrides: {
          default: 'grok-3-beta',
          cheap: 'grok-3-mini-beta',
          reasoning: 'grok-3-mini-beta',
        },
      },
    },
  },
};

/**
 * Example plugin demonstrating the usage of planning hook with enhanced issue tracking
 */
export const genaicodeTracker: Plugin = {
  name: 'genaicode-tracker',

  // Planning pre-hook: Inject documentation review prompt
  planningPreHook: async ({ prompt }) => {
    try {
      // Add documentation review prompt
      return (
        prompt +
        '\n\n' +
        '**DOCUMENTATION REVIEW:**\n' +
        'Before finalizing the plan, ALWAYS review if updates are needed in:\n\n' +
        '*   `GENAICODE_TRACKER.md`: to reflect task progress, new tasks, or changes to existing tasks.\n' +
        '*   `GENAICODE_INSTRUCTIONS.md`: to capture new development patterns, process improvements, or best practices.\n\n' +
        'Include these updates in the plan if relevant. This ensures our documentation stays current and useful.\n' +
        'When including updates to the codegen plan, be verbose on the changes you want to make to the files.\n'
      );
    } catch (error) {
      console.error('Error in planning pre-hook:', error);
      // Return original prompt in case of error
      return prompt;
    }
  },
};
