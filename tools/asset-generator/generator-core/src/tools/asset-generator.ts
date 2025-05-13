import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';

/**
 * Function definition for generating a complete asset implementation in one shot.
 */
const generateCompleteAssetDef: FunctionDef = {
  name: 'generateCompleteAsset',
  description: 'Generate a complete asset implementation in a single response.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The complete generated TypeScript code for the asset.',
      },
      summaryOfChanges: {
        type: 'string',
        description: 'A brief summary of the changes made or the asset generated.',
      },
    },
    required: ['content', 'summaryOfChanges'],
  },
};

/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param assessment Assessment of the current implementation
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @param fromScratch Whether to regenerate the asset from scratch, ignoring the current implementation
 * @param originalDescription Original description of the asset (used when fromScratch is true)
 * @param modelType The model type to use for generation (default: ModelType.DEFAULT)
 * @returns Promise resolving to the improved implementation code
 */
export async function generateImprovedAsset(
  assetName: string,
  currentImplementation: string | null,
  assessment: string,
  additionalPrompt?: string,
  fromScratch?: boolean,
  originalDescription?: string,
  modelType: ModelType = ModelType.DEFAULT,
): Promise<string> {
  // If fromScratch is true, ignore the current implementation
  const effectiveImplementation = fromScratch ? null : currentImplementation;

  const basePromptMessage = `
    Generate ${
      fromScratch ? 'a new implementation from scratch' : 'an improved implementation'
    } of the ${assetName} asset.
    ${
      effectiveImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }
    
    Assessment of current version:
    ${assessment}

    ${additionalPrompt ? `Special Requirements from User:\n${additionalPrompt}` : ''}
    ${
      fromScratch
        ? 'IMPORTANT: Create a completely new implementation from scratch, ignoring any existing code structure.\\\\n'
        : ''
    }

    ${
      originalDescription
        ? `IMPORTANT: Preserve this original asset description exactly as provided:\n\n\`\`\`\n${originalDescription}\n\`\`\``
        : ''
    }

    Requirements:
    1. Implement the Asset interface with name and render method
    2. Use TypeScript and Canvas API
    3. Focus on visual quality and performance
    4. Include proper type annotations
    5. Follow best practices for code organization
    6. IMPORTANT: Adhere to suggested improvements from the assessment
    7. Make sure the code is valid and error-free
    8. Find balance between code readability and verbosity
    9. IMPORTANT: Make only the minimal necessary changes to address the issues highlighted in the assessment
    10. Preserve all parts of the code that are already working well
    11. In the render method, do not clean the canvas, assume it is already cleared and ready for rendering
    12. Your modifications should directly correspond to the issues identified in the assessment
    13. DO NOT refactor or rewrite the entire codebase unless the assessment explicitly requires it
    14. Focus on incremental, targeted improvements rather than complete overhauls

    IMPORT STATEMENT AND ASSET FORMAT REQUIREMENTS:
    1. ALWAYS use this exact import statement at the top of the file:
       \
import { Asset } from '../../../generator-core/src/assets-types';\

    2. ALWAYS export the asset as a const object (NOT a class), following this format:
       \
export const AssetName: Asset = { ... };\

    3. Include all required properties: name, description, stances, and render method

    Example of correct asset format:
    \
\
\
    import { Asset } from '../../../generator-core/src/assets-types';

    // Type definitions and helper functions here...

    export const SomeAsset: Asset = {
      name: 'SomeAsset',
      description: \
Detailed description of the asset...\
,
      stances: ['default', 'other'],
      render: (ctx, x, y, width, height, progress, stance, direction) => {
        // Rendering implementation
      },
    };
    \
\
\

    Provide only the necessary changes to address the issues in the assessment while maintaining the overall structure and approach of the existing code. If the current implementation is good in some areas, keep those parts unchanged.
    Please generate the complete and improved implementation in a single response.
  `;

  const prompt: PromptItem[] = [
    ASSET_GENERATOR_PROMPT,
    {
      type: 'user',
      text: basePromptMessage,
      cache: true,
    },
  ];

  const result = await generateCode(
    prompt,
    {
      functionDefs: [generateCompleteAssetDef],
      requiredFunctionName: generateCompleteAssetDef.name,
      temperature: 0.7,
      modelType,
      expectedResponseType: { functionCall: true, text: false, media: false },
    },
    {},
  );

  const functionCall = result.find((item) => item.type === 'functionCall')?.functionCall;

  if (!functionCall || !functionCall.args) {
    throw new Error('Failed to generate asset implementation: No function call or arguments in response.');
  }

  const { content, summaryOfChanges } = functionCall.args as { content: string; summaryOfChanges?: string };

  if (summaryOfChanges) {
    console.log('Asset generation summary:', summaryOfChanges);
  }

  if (!content) {
    throw new Error('Failed to generate asset implementation: No content in response.');
  }

  console.log('Complete asset implementation generated successfully.');
  return content;
}
