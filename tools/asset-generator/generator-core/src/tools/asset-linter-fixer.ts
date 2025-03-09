import { LintResult, formatLintErrors } from './asset-linter.js';
import { FunctionDef, ModelType, PromptItem } from 'genaicode';
import { generateCode } from './genaicode-executor.js';

/**
 * Interface for the result of fixing linting errors
 */
export interface LintFixResult {
  /** Whether the fixing was successful */
  success: boolean;
  /** Fixed code if successful, original code if not */
  code: string;
  /** Summary of changes made */
  summary: string;
  /** Error message if fixing failed */
  error?: string;
}

/**
 * Fix linting errors using GenAIcode
 * @param lintResult Results from linting an asset file
 * @returns Promise resolving to the fixed code and summary
 * @throws Error if fixing fails
 */
export async function fixLintErrors(lintResult: LintResult): Promise<LintFixResult> {
  try {
    if (!lintResult.hasErrors && !lintResult.hasWarnings) {
      return {
        success: true,
        code: lintResult.source,
        summary: 'No linting issues to fix.',
      };
    }

    // Format the linting errors for the prompt
    const formattedErrors = formatLintErrors(lintResult);

    // Create the prompt for GenAIcode
    const promptMessage = `
You are a TypeScript expert tasked with fixing ESLint errors in a game asset file.

Here is the original code with linting issues:

\`\`\`typescript
${lintResult.source}
\`\`\`

Here are the linting errors that need to be fixed:

${formattedErrors}

Please fix all linting issues while preserving the functionality and structure of the code.
Focus only on fixing the linting errors, don't make unrelated changes or improvements.
Return the complete fixed code that addresses all the linting issues.

Your response should include a brief summary of the changes you made to fix the issues.
`;

    const prompt: PromptItem[] = [
      {
        type: 'systemPrompt',
        text: 'You are a TypeScript expert that fixes linting errors in code while preserving functionality.',
      },
      {
        type: 'user',
        text: promptMessage,
      },
    ];

    // Generate fixed code using GenAIcode
    const fixResults = await generateCode(prompt, [fixLintErrorsDef], 'fixLintErrors', 0.7, ModelType.DEFAULT);

    if (!fixResults || fixResults.length === 0 || !fixResults[0]?.args) {
      throw new Error('Failed to generate fixed code');
    }

    const result = fixResults[0].args as { fixedCode: string; summary: string };

    return {
      success: true,
      code: result.fixedCode,
      summary: result.summary,
    };
  } catch (error) {
    console.error('Error fixing linting errors:', error);
    return {
      success: false,
      code: lintResult.source, // Return original code on error
      summary: 'Failed to fix linting errors.',
      error: (error as Error).message,
    };
  }
}

/**
 * Function definition for fixing lint errors
 */
const fixLintErrorsDef: FunctionDef = {
  name: 'fixLintErrors',
  description: 'Fix ESLint errors in TypeScript code',
  parameters: {
    type: 'object',
    properties: {
      fixedCode: {
        type: 'string',
        description: 'The fixed code with linting errors resolved',
      },
      summary: {
        type: 'string',
        description: 'Summary of changes made to fix the linting errors',
      },
    },
    required: ['fixedCode', 'summary'],
  },
};
