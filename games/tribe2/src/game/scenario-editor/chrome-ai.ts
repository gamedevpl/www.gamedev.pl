/**
 * Chrome AI (Prompt API) integration for scenario generation.
 * Uses Chrome's built-in Gemini Nano model when available.
 *
 * @see https://developer.chrome.com/docs/ai/prompt-api
 */

import { ScenarioConfig } from './scenario-types';
import { exportScenarioSchema, importScenarioFromJson } from './scenario-export';

/**
 * AI availability status.
 */
export type AIAvailability = 'readily' | 'after-download' | 'no' | 'unsupported';

/**
 * Initial prompt message for the language model.
 */
interface AILanguageModelPrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI session interface that works with the Chrome Prompt API.
 */
interface AILanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): ReadableStream<string>;
  destroy(): void;
  clone(): Promise<AILanguageModelSession>;
}

/**
 * Options for creating a language model session.
 */
interface AILanguageModelCreateOptions {
  topK?: number;
  temperature?: number;
  initialPrompts?: AILanguageModelPrompt[];
}

/**
 * Capabilities returned by the language model.
 */
interface AILanguageModelCapabilities {
  available: 'readily' | 'after-download' | 'no';
  defaultTopK?: number;
  maxTopK?: number;
  defaultTemperature?: number;
}

/**
 * Extended window interface for Chrome AI Prompt API.
 */
declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities: () => Promise<AILanguageModelCapabilities>;
        create: (options?: AILanguageModelCreateOptions) => Promise<AILanguageModelSession>;
      };
    };
  }
}

/**
 * Checks if Chrome AI (Prompt API) is available in this browser.
 */
export async function checkAIAvailability(): Promise<AIAvailability> {
  if (!window.ai || !window.ai.languageModel) {
    return 'unsupported';
  }

  try {
    const capabilities = await window.ai.languageModel.capabilities();
    return capabilities.available;
  } catch (error) {
    console.error('Error checking AI availability:', error);
    return 'unsupported';
  }
}

/**
 * Creates an AI session using the Chrome Prompt API.
 */
async function createAISession(): Promise<AILanguageModelSession | null> {
  if (!window.ai || !window.ai.languageModel) {
    return null;
  }

  try {
    // Create session with initial prompts using the correct Prompt API format
    return await window.ai.languageModel.create({
      temperature: 0.7,
      topK: 40,
      initialPrompts: [
        {
          role: 'system',
          content: getSystemPrompt(),
        },
      ],
    });
  } catch (error) {
    console.error('Error creating AI session:', error);
    return null;
  }
}

/**
 * Gets the system prompt for scenario generation.
 */
function getSystemPrompt(): string {
  return `You are a game scenario designer for a survival/tribe simulation game called "Tribe2".
Your task is to generate game scenarios in JSON format based on user descriptions.
The scenarios define the initial state of the game world including tribes, humans, animals, and resources.
Always output ONLY valid JSON that matches the required schema - no explanations or markdown.`;
}

/**
 * Gets the user prompt template for scenario generation.
 */
function getUserPrompt(userRequest: string): string {
  const schema = exportScenarioSchema();

  return `Generate a game scenario based on this description:
"${userRequest}"

Use this JSON schema (output ONLY the JSON, no markdown or explanations):
${schema}

Important rules:
1. Output ONLY valid JSON - no code blocks, no explanations
2. At least one human must have "isPlayer": true
3. The player human should also have "isLeader": true
4. Positions must be within the mapWidth and mapHeight bounds
5. Each human's tribeId must match their tribe's id
6. Include a variety of berryBushes, prey, and predators for a balanced ecosystem`;
}

/**
 * Result of scenario generation.
 */
export interface GenerationResult {
  success: boolean;
  config?: ScenarioConfig;
  error?: string;
  rawResponse?: string;
}

/**
 * Generates a scenario using Chrome AI's Prompt API.
 *
 * @param userRequest - Natural language description of the desired scenario
 * @param onProgress - Optional callback for streaming progress updates
 * @returns The generated scenario config or an error
 */
export async function generateScenarioWithChromeAI(
  userRequest: string,
  onProgress?: (partialResponse: string) => void,
): Promise<GenerationResult> {
  const availability = await checkAIAvailability();

  if (availability === 'unsupported') {
    return {
      success: false,
      error:
        'Chrome AI is not available. Enable it in chrome://flags/#prompt-api-for-gemini-nano and chrome://flags/#optimization-guide-on-device-model',
    };
  }

  if (availability === 'after-download') {
    return {
      success: false,
      error: 'Chrome AI model is still downloading. Please wait and try again later.',
    };
  }

  if (availability === 'no') {
    return {
      success: false,
      error: 'Chrome AI is not available on this device.',
    };
  }

  const session = await createAISession();
  if (!session) {
    return {
      success: false,
      error: 'Failed to create AI session.',
    };
  }

  try {
    const prompt = getUserPrompt(userRequest);
    let response: string;

    // Try streaming if callback provided
    if (onProgress) {
      response = '';
      const stream = session.promptStreaming(prompt);
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // The API returns cumulative text chunks
          response = value;
          onProgress(response);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      response = await session.prompt(prompt);
    }

    // Clean up the response - remove markdown code blocks if present
    const JSON_CODE_BLOCK_PREFIX = '```json';
    const CODE_BLOCK_MARKER = '```';
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith(JSON_CODE_BLOCK_PREFIX)) {
      cleanedResponse = cleanedResponse.slice(JSON_CODE_BLOCK_PREFIX.length);
    } else if (cleanedResponse.startsWith(CODE_BLOCK_MARKER)) {
      cleanedResponse = cleanedResponse.slice(CODE_BLOCK_MARKER.length);
    }
    if (cleanedResponse.endsWith(CODE_BLOCK_MARKER)) {
      cleanedResponse = cleanedResponse.slice(0, -CODE_BLOCK_MARKER.length);
    }
    cleanedResponse = cleanedResponse.trim();

    // Try to parse and validate the response
    const result = importScenarioFromJson(cleanedResponse);

    if (result.success) {
      return {
        success: true,
        config: result.config,
        rawResponse: response,
      };
    } else {
      return {
        success: false,
        error: `AI generated invalid JSON: ${result.error}`,
        rawResponse: response,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  } finally {
    session.destroy();
  }
}

/**
 * Gets a human-readable status message for the AI availability.
 */
export function getAIStatusMessage(availability: AIAvailability): string {
  switch (availability) {
    case 'readily':
      return 'Chrome AI is ready';
    case 'after-download':
      return 'Chrome AI model is downloading...';
    case 'no':
      return 'Chrome AI not available on this device';
    case 'unsupported':
      return 'Chrome AI not supported (requires Chrome 127+)';
  }
}
