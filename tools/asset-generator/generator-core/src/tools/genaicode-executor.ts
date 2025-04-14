import { GenerateContentFunction, FunctionDef, ModelType, PromptItem, FunctionCall } from 'genaicode';
import { generateContent as generateContentAiStudio } from 'genaicode/ai-service/ai-studio.js';
import { generateContent as generateContentAnthropic } from 'genaicode/ai-service/anthropic.js';

/**
 * Helper function to introduce a delay.
 * @param ms Milliseconds to wait.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a GenerateContentFunction with retry logic.
 * @param func The function to wrap.
 * @param maxRetries Maximum number of retry attempts.
 * @param retryDelay Delay between retries in milliseconds.
 * @returns The wrapped function with retry logic.
 */
function retryWrapper(
  func: GenerateContentFunction,
  maxRetries = 3,
  retryDelay = 10000, // 10 seconds
): GenerateContentFunction {
  const wrapped: GenerateContentFunction = async (...args) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await func(...args);
      } catch (error) {
        attempt++;
        console.error(`Error in AI call (Attempt ${attempt}/${maxRetries + 1}):`, error);
        if (attempt <= maxRetries) {
          console.log(`Retrying AI call in ${retryDelay / 1000} seconds...`);
          await delay(retryDelay);
        } else {
          console.error(`Failed AI call after ${maxRetries + 1} attempts.`);
          throw new Error(`Failed AI call: ${(error as Error).message}`);
        }
      }
    }
    // This line should theoretically not be reached, but satisfies TypeScript's need for a return path.
    throw new Error('Failed AI call after all retries.');
  };
  return wrapped;
}

// Wrap the original functions with the retry mechanism
export const generateContent: GenerateContentFunction = retryWrapper(generateContentAiStudio);
export const generateCode: GenerateContentFunction = retryWrapper(generateContentAnthropic);
