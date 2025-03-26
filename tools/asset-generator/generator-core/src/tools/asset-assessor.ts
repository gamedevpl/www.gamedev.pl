import * as path from 'path';
import * as fs from 'fs/promises';
import { FunctionDef, ModelType, PromptImageMediaType, PromptItem } from 'genaicode';
import { Asset } from '../assets-types.js';
import { generateContent } from './genaicode-executor.js';
import { ASSET_ASSESSOR_PROMPT } from './prompts.js';

interface AssessmentContext {
  referenceImageDescription?: string;
  stanceDescriptions: Record<string, string>;
  implementationDescription?: string;
}

/**
 * Assess an asset by analyzing its rendering result
 */
export async function assessAsset(
  assetPath: string,
  asset: Asset,
  currentImplementation: string | null,
  stanceMedia: {
    stance: string;
    mediaType: string;
    dataUrl: string;
  }[],
): Promise<string> {
  try {
    // Initialize assessment context and base prompt items
    const context: AssessmentContext = {
      stanceDescriptions: {},
    };

    // Handle reference image if specified
    let referenceImageData: string | undefined;
    if (asset.referenceImage) {
      try {
        const imagePath = path.join(path.dirname(assetPath), asset.referenceImage);
        const imageBuffer = await fs.readFile(imagePath);
        referenceImageData = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        // Step 1: Describe reference image
        const [refImageResult] = await generateContent(
          [
            ASSET_ASSESSOR_PROMPT,
            {
              type: 'user',
              text: 'Reference image for analysis:',
              images: [
                {
                  mediaType: 'image/png',
                  base64url: referenceImageData.split('data:image/png;base64,')[1],
                },
              ],
            },
            {
              type: 'user',
              text: 'Please analyze the reference image in detail. This will serve as the standard against which the rendered asset will be critically evaluated. Identify key visual elements, style characteristics, and essential features that should be present in the rendered asset.',
            },
          ],
          [describeReferenceImageDef, describeAssetRenderingDef, describeCurrentImplementationDef, assessAssetDef],
          describeReferenceImageDef.name,
          0.7,
          ModelType.CHEAP,
        );

        context.referenceImageDescription = (refImageResult.args as { description: string }).description;

        console.log('Reference image analysis completed:', context.referenceImageDescription);
      } catch (error) {
        console.warn(`Warning: Could not load reference image ${asset.referenceImage}:`, (error as Error).message);
      }
    }

    // Step 2: Describe rendered asset for each stance separately
    // Group stanceMedia by stance
    const stanceGroups: Record<string, typeof stanceMedia> = {};
    stanceMedia.forEach((media) => {
      if (!stanceGroups[media.stance]) {
        stanceGroups[media.stance] = [];
      }
      stanceGroups[media.stance]!.push(media);
    });

    // Process each stance individually
    await Promise.all(
      Object.entries(stanceGroups).map(async ([stance, mediaItems]) => {
        console.log(`Analyzing stance: ${stance}`);

        const [renderResult] = await generateContent(
          [
            ASSET_ASSESSOR_PROMPT,
            ...mediaItems.map<PromptItem>(({ mediaType, dataUrl }) => ({
              type: 'user',
              text: `Rendered asset`,
              images: [
                {
                  mediaType: mediaType as PromptImageMediaType,
                  base64url: dataUrl.split(`data:${mediaType};base64,`)[1],
                },
              ],
            })),
            {
              type: 'user',
              text: `Please analyze the rendering of the asset with a critical eye. Focus on visual fidelity, artistic quality, and how well it fulfills its intended purpose. Be particularly attentive to any discrepancies or visual issues that detract from the asset's effectiveness. Your analysis should be honest and unbiased, based solely on what you observe in the rendering, not what might have been intended.`,
            },
            {
              type: 'user',
              text: 'IMPORTANT: Output maximum 200 words, not more! Be direct and specific in your criticism.',
            },
          ],
          [describeReferenceImageDef, describeAssetRenderingDef, describeCurrentImplementationDef, assessAssetDef],
          describeAssetRenderingDef.name,
          0.7,
          ModelType.CHEAP,
        );

        context.stanceDescriptions[stance] = (renderResult.args as { description: string }).description;

        console.log(`Analysis for stance "${stance}" completed:`, context.stanceDescriptions[stance]);
      }),
    );

    // Step 3: Describe implementation (if available)
    if (currentImplementation) {
      const [implResult] = await generateContent(
        [
          ASSET_ASSESSOR_PROMPT,
          {
            type: 'user',
            text: `Current implementation:\n\n\`\`\`typescript\n${currentImplementation}\n\`\`\``,
          },
          {
            type: 'user',
            text: 'Please analyze the implementation in detail, with particular attention to how different stances are handled. Identify any technical issues that might be causing visual discrepancies in the rendered output.',
          },
          {
            type: 'user',
            text: 'IMPORTANT: Output maximum 1000 words, not more! Be direct and specific in your analysis.',
          },
        ],
        [describeReferenceImageDef, describeAssetRenderingDef, describeCurrentImplementationDef, assessAssetDef],
        describeCurrentImplementationDef.name,
        0.7,
        ModelType.CHEAP,
      );

      context.implementationDescription = (implResult.args as { description: string }).description;

      console.log('Implementation analysis completed:', context.implementationDescription);
    }

    // Prepare stance descriptions for the final assessment
    let stanceDescriptionsText = '';
    for (const [stance, description] of Object.entries(context.stanceDescriptions)) {
      stanceDescriptionsText += `### Stance: ${stance}\n\n${description}\n\n`;
    }

    // Prepare the final assessment prompt with enhanced structure for critical evaluation
    const finalAssessmentPrompt = `
Please provide a critical final assessment based on all previous analyses. Your assessment should be honest, unbiased, and based solely on the visual evidence in the rendered output.

# Asset Information
- **Name**: ${asset.name}
- **Description**: ${asset.description}

# Reference Image Analysis
${context.referenceImageDescription || 'No reference image provided.'}

# Observed Stance Characteristics
${stanceDescriptionsText}

# Implementation Analysis
${context.implementationDescription || 'No current implementation available.'}

# Final Assessment Requirements
1. Provide a comprehensive, critical assessment that addresses EACH stance individually
2. For each stance:
   a. Clearly identify specific visual issues and discrepancies between expected and actual output
   b. Rate the severity of each discrepancy (Minor, Moderate, Significant, Critical)
   c. Provide clear, actionable recommendations to address each issue
   d. Be direct and honest - if something looks wrong, say so explicitly
3. Prioritize the most critical issues that need to be addressed
4. Include both visual and technical aspects in your assessment
5. Consider how stances work together as a cohesive asset
6. IMPORTANT: Structure your assessment with clear headers for each stance
7. Make sure each stance-specific issue has a corresponding recommendation
8. Focus on what you SEE in the rendering, not what might have been intended
9. Be especially critical when a rendered stance significantly deviates from its intended design
10. Do not soften criticism - be clear and direct about problems

Remember: You are evaluating ONLY what is visually presented, not the intentions or the code behind it. Your assessment should be unbiased and based solely on the quality and accuracy of the rendered output.
`;

    // Step 4: Generate the final assessment
    const [assessResult] = await generateContent(
      [
        ASSET_ASSESSOR_PROMPT,
        {
          type: 'user',
          text: finalAssessmentPrompt,
        },
      ],
      [describeReferenceImageDef, describeAssetRenderingDef, describeCurrentImplementationDef, assessAssetDef],
      assessAssetDef.name,
      0.7,
      ModelType.CHEAP,
    );

    return (assessResult.args as { assessment: string }).assessment;
  } catch (error) {
    console.error('Error during asset assessment:', error);
    throw new Error(`Failed to assess asset: ${(error as Error).message}`);
  }
}

/**
 * Function definition for describing a reference image
 */
const describeReferenceImageDef: FunctionDef = {
  name: 'describeReferenceImage',
  description:
    'Describe the reference image for an asset in detail, identifying key visual elements and characteristics',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Detailed description of the reference image, including style, proportions, colors, and key visual elements that define the asset',
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for describing an asset rendering
 */
const describeAssetRenderingDef: FunctionDef = {
  name: 'describeAssetRendering',
  description: 'Critically analyze the rendered asset, focusing on visual quality, accuracy, and potential issues',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: `Detailed critical analysis of the rendered asset (max 200 words).
Include:
1. Overall visual impression
2. Key visual elements present or missing
3. Quality of execution (proportions, colors, style)
4. Specific visual issues or artifacts
5. How well it fulfills its intended purpose
6. Comparison to expected characteristics
7. Clear identification of discrepancies
8. Honest evaluation of visual quality

Be direct and critical - if something looks wrong, say so explicitly. Focus on what you actually see, not what might have been intended.`,
        maxLength: 5000,
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for describing current implementation
 */
const describeCurrentImplementationDef: FunctionDef = {
  name: 'describeCurrentImplementation',
  description: 'Describe the current implementation of the asset, focusing on how different stances are handled',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Detailed description of the current implementation, with particular attention to technical aspects that might affect visual output',
      },
    },
    required: ['description'],
  },
};

/**
 * Function definition for the final assessment
 */
const assessAssetDef: FunctionDef = {
  name: 'assessAsset',
  description: 'Critically assess an asset by analyzing its rendering result against expected characteristics',
  parameters: {
    type: 'object',
    properties: {
      assessment: {
        type: 'string',
        description: `Output a critical, structured analysis that honestly evaluates the rendered asset.

For each stance, include:
1. <Stance Name> - Clear header identifying the stance
2. <Visual Assessment> - Critical evaluation of what you actually SEE in the rendering
3. <Discrepancy Analysis> - Specific issues where rendered output deviates from expected characteristics
4. <Severity Rating> - Rate each discrepancy as Minor, Moderate, Significant, or Critical
5. <Recommendations> - Clear, actionable suggestions to address each issue

Be direct and honest - if something looks wrong, say so explicitly. Do not soften criticism.
Focus on what is visually presented, not what might have been intended.
Be especially critical when a rendered stance significantly deviates from its intended design.

Use not more than 200 words per stance.`,
        maxLength: 2000,
      },
    },
    required: ['assessment'],
  },
};