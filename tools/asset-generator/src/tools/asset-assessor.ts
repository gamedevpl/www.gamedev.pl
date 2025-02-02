import { FunctionDef, ModelType } from 'genaicode';
import { Asset } from '../assets/assets-types.js';
import { generateContent } from './genaicode-executor.js';

/**
 * Assess an asset by analyzing its rendering result
 * @param asset The asset to assess
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param dataUrl The data URL of the rendered asset
 * @returns Promise resolving to the assessment text
 */
export async function assessAsset(
  asset: Asset,
  currentImplementation: string | null,
  dataUrl: string,
): Promise<string> {
  const prompt = `Analyze this asset rendering:
Asset Name: ${asset.name}
Asset Description: ${asset.description}
    ${
      currentImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }

Please assess:
1. Visual quality and appearance
2. How well the asset meets its intended purpose
3. What improvements could be made to make it meet its purpose better

Provide a detailed assessment focusing on the above points.

Respond using the \`assessAsset\` function with the assessment text as the argument.
The assessment should be clear, concise, and constructive. It should not exceed 1000 words.
  `;

  const assessment = await generateContent(
    [
      {
        type: 'user',
        text: prompt,
        images: [{ mediaType: 'image/png', base64url: dataUrl.split('data:image/png;base64,')[1] }],
      },
    ],
    [assessAssetDef],
    'assessAsset',
    0.7,
    ModelType.CHEAP,
  );

  return assessment[0].args.assessment as string;
}

const assessAssetDef: FunctionDef = {
  name: 'assessAsset',
  description: 'Assess an asset by analyzing its rendering result',
  parameters: {
    type: 'object',
    properties: {
      assessment: {
        type: 'string',
        description: 'The outcome of the assessment',
      },
    },
    required: ['assessment'],
  },
};
