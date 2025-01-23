import OpenAI from 'openai';
import { FunctionCall, FunctionDef, PromptItem, Plugin, ModelType } from 'genaicode';

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

async function generateContent(
  prompt: PromptItem[],
  functionDefs: FunctionDef[],
  requiredFunctionName: string | null,
  temperature: number,
  modelType = ModelType.DEFAULT,
): Promise<FunctionCall[]> {
  const { getServiceConfig } = await import('genaicode/ai-service/service-configurations.js');
  const serviceConfig = getServiceConfig('plugin:deepseek-ai-service');

  const openai = new OpenAI({
    apiKey: serviceConfig.apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  const { internalGenerateToolCalls } = await import('genaicode/ai-service/openai.js');
  const { processFunctionCalls } = await import('genaicode/ai-service/common.js');

  const last = prompt.slice(-1)[0];
  const lastText = last.text;
  if (requiredFunctionName) {
    if (last.type === 'user' && last.text && !last.text.includes('IMPORTANT REQUIREMENT')) {
      /* sometimes it is broken :( */
      last.text += `\n\nIMPORTANT REQUIREMENT: Please respond to me with only one function call. The function called must be \`${requiredFunctionName}\`.`;
    }
  }

  let toolCalls: Awaited<ReturnType<typeof internalGenerateToolCalls>>;
  try {
    toolCalls = await internalGenerateToolCalls(
      prompt,
      functionDefs,
      requiredFunctionName,
      temperature,
      modelType,
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

  if (requiredFunctionName && toolCalls.length > 1) {
    /* sometimes it is broken :( */
    console.log('Multiple function calls, but all are the same, so keeping only one.');
    toolCalls = toolCalls.filter((call) => call.function.name === requiredFunctionName).slice(0, 1);
  }

  const functionCalls = toolCalls.map((call) => {
    const name =
      call.function.name /* sometimes it is broken :( */
        .match(/\w+/)?.[0] ?? call.function.name;
    const args = JSON.parse(call.function.arguments);

    return {
      id: call.id,
      name,
      args,
    };
  });

  return processFunctionCalls(functionCalls, functionDefs);
}

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
