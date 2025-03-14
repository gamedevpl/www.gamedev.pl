import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';

/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param assessment Assessment of the current implementation
 * @param additionalPrompt Additional user-provided prompt with special requirements
 * @returns Promise resolving to the improved implementation code
 */
export async function generateImprovedAsset(
  assetName: string,
  currentImplementation: string | null,
  assessment: string,
  additionalPrompt?: string,
): Promise<string> {
  const promptMessage = `
    Generate an improved implementation of the ${assetName} asset.
    ${
      currentImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }
    
    Assessment of current version:
    ${assessment}

    ${additionalPrompt ? `Special Requirements from User:\n    ${additionalPrompt}\n` : ''}

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

    Provide only the necessary changes to address the issues in the assessment while maintaining the overall structure and approach of the existing code. If the current implementation is good in some areas, keep those parts unchanged.
  `;

  const prompt: PromptItem[] = [
    ASSET_GENERATOR_PROMPT,
    {
      type: 'user',
      text: promptMessage,
    },
  ];

  const improvedImplementation = await generateCode(prompt, [saveAssetDef], 'saveAsset', 0.7, ModelType.DEFAULT);

  console.log('Improved implementation:', improvedImplementation[0]!.args!.summaryOfChanges);

  return improvedImplementation[0]!.args!.content as string;
}

const saveAssetDef: FunctionDef = {
  name: 'saveAsset',
  description: 'Generate an improved implementation of an asset',
  parameters: {
    type: 'object',
    properties: {
      summaryOfChanges: { type: 'string', description: 'Summary of changes made in the asset, max 100 words.' },
      content: { type: 'string' },
    },
    required: ['summaryOfChanges', 'content'],
  },
};