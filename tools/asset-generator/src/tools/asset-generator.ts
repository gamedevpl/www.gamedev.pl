import { FunctionDef, ModelType } from 'genaicode';
import { generateCode } from './genaicode-executor.js';
import { ASSET_GENERATOR_PROMPT } from './prompts.js';

/**
 * Generate an improved implementation of an asset
 * @param assetName Name of the asset
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param assessment Assessment of the current implementation
 * @returns Promise resolving to the improved implementation code
 */
export async function generateImprovedAsset(
  assetName: string,
  currentImplementation: string | null,
  assessment: string,
): Promise<string> {
  const prompt = `
    Generate an improved implementation of the ${assetName} asset.
    ${
      currentImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }
    
    Assessment of current version:
    ${assessment}

    Requirements:
    1. Implement the Asset interface with name and render method
    2. Use TypeScript and Canvas API
    3. Focus on visual quality and performance
    4. Include proper type annotations
    5. Follow best practices for code organization
    6. IMPORTANT: Adhere to suggested improvements from the assessment
    7. Do not modify the asset name or description
    8. Make sure the code is valid and error-free
    9. Find balance between code readability and verbosity
    10. Modify the existing code as needed, retain parts that are already good
    11. In the render method, do not clean the canvas, assume it is already cleared and ready for rendering

    Generate the complete TypeScript file content for the improved asset.
  `;

  const improvedImplementation = await generateCode(
    [
      ASSET_GENERATOR_PROMPT,
      {
        type: 'user',
        text: prompt,
      },
    ],
    [saveAssetDef],
    'saveAsset',
    0.7,
    ModelType.DEFAULT,
  );

  return improvedImplementation[0].args.content as string;
}

const saveAssetDef: FunctionDef = {
  name: 'saveAsset',
  description: 'Generate an improved implementation of an asset',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string' },
    },
    required: ['content'],
  },
};
