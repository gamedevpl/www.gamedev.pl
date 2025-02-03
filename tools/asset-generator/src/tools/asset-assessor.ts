import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { Asset } from '../assets/assets-types.js';
import { generateContent } from './genaicode-executor.js';
import { ASSET_ASSESSOR_PROMPT } from './prompts.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getAssetFilePath } from './asset-loader.js';

/**
 * Assess an asset by analyzing its rendering result
 * @param assetPath Path to the asset file
 * @param asset The asset to assess
 * @param currentImplementation Current implementation of the asset (if exists)
 * @param dataUrl The data URL of the rendered asset
 * @returns Promise resolving to the assessment text
 */
export async function assessAsset(
  assetPath: string,
  asset: Asset,
  currentImplementation: string | null,
  dataUrl: string,
): Promise<string> {
  // Handle reference image if specified
  let referenceImageData: string | undefined;
  if (asset.referenceImage) {
    try {
      // Get the reference image path
      const imagePath = path.join(path.dirname(assetPath), asset.referenceImage);

      // Read and convert to base64
      const imageBuffer = await fs.readFile(imagePath);
      referenceImageData = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      console.warn(`Warning: Could not load reference image ${asset.referenceImage}:`, (error as Error).message);
    }
  }

  const promptMessage = `Analyze this asset rendering:
Asset Name: ${asset.name}
Asset Description: ${asset.description}
    ${
      currentImplementation
        ? 'Current implementation:\\n```typescript\\n' + currentImplementation + '\\n```'
        : 'No current implementation exists.'
    }

${
  referenceImageData
    ? 'Compare this rendering with the provided reference image, considering:\n' +
      '1. How well the asset matches the reference image style and proportions\n' +
      '2. What elements from the reference are well-implemented\n' +
      '3. What elements from the reference could be improved\n' +
      '4. Any elements that are missing'
    : 'No reference image provided for comparison.'
}

Please assess:
1. Visual quality and appearance
2. How well the asset meets its intended purpose
3. What improvements could be made to make it meet its purpose better

Respond using the \`assessAsset\` function with the assessment text as the argument.
The assessment should be clear, concise, and constructive. It should not exceed 1000 words.
  `;

  const prompt: PromptItem[] = [
    ASSET_ASSESSOR_PROMPT,
    {
      type: 'user',
      text: promptMessage,
    },
  ];
  if (referenceImageData) {
    prompt.push({
      type: 'user',
      text: 'This is the reference image:',
      images: [{ mediaType: 'image/png', base64url: referenceImageData.split('data:image/png;base64,')[1] } as const],
    });
  }
  prompt.push({
    type: 'user',
    text: 'This is the rendering of the current implementation of the asset:',
    images: [{ mediaType: 'image/png', base64url: dataUrl.split('data:image/png;base64,')[1] }],
  });

  const assessment = await generateContent(prompt, [assessAssetDef], 'assessAsset', 0.7, ModelType.CHEAP);

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
