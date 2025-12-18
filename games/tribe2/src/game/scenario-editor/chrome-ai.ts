/**
 * Chrome AI (Prompt API) integration for scenario generation.
 * Uses Chrome's built-in Gemini Nano model.
 * * Updated for Late 2025 (Chrome 140+) specifications.
 */

import { ScenarioConfig } from './scenario-types';
import { exportScenarioSchema, importScenarioFromJson } from './scenario-export';

/**
 * AI availability status. 
 * Late 2025 spec uses "available", "downloadable", "downloading", "unavailable".
 */
export type AIAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/**
 * The modern LanguageModel interface (Chrome 140+).
 */
interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): AsyncIterable<string>; // AsyncIterable is now standard
  destroy(): void;
  // Cleanup alias
  close?(): void;
}

/**
 * Global LanguageModel static interface.
 */
declare global {
  interface LanguageModel {
    availability(): Promise<AIAvailability>;
    create(options?: {
      topK?: number;
      temperature?: number;
      initialPrompt?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    }): Promise<LanguageModelSession>;
  }

  // The global constructor/object
  const LanguageModel: LanguageModel;

  interface Window {
    // window.ai is now often used for task-specific APIs, 
    // while Prompt API uses global LanguageModel.
    ai?: any; 
  }
}

/**
 * Checks if Gemini Nano is ready.
 */
export async function checkAIAvailability(): Promise<AIAvailability> {
  try {
    if (typeof LanguageModel === 'undefined') return 'unavailable';
    return await LanguageModel.availability();
  } catch (e) {
    console.error('Prompt API availability check failed:', e);
    return 'unavailable';
  }
}

/**
 * Robust JSON extraction.
 */
function extractJson(text: string): string {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    return text.substring(firstBrace, lastBrace + 1).trim();
  }
  return text.trim();
}

export interface GenerationResult {
  success: boolean;
  config?: ScenarioConfig;
  error?: string;
  rawResponse?: string;
}

/**
 * Generates a scenario using the global LanguageModel API.
 */
export async function generateScenarioWithChromeAI(
  userRequest: string,
  onProgress?: (partialResponse: string) => void,
): Promise<GenerationResult> {
  const status = await checkAIAvailability();

  if (status !== 'available') {
    return { 
      success: false, 
      error: getStatusMessage(status)
    };
  }

  let session: LanguageModelSession | undefined;

  try {
    const schema = exportScenarioSchema();
    
    // Create session using the 2025 'initialPrompt' format
    session = await LanguageModel.create({
      temperature: 0.4, // Keep it low for structural data
      topK: 3,
      initialPrompt: [
        { 
          role: 'system', 
          content: `You are a scenario designer for Tribe2. Output ONLY raw JSON matching this schema: ${schema}` 
        }
      ]
    });

    const prompt = `Generate a scenario: "${userRequest}". One human must be "isPlayer": true and "isLeader": true.`;
    let responseText = '';

    if (onProgress) {
      const stream = session.promptStreaming(prompt);
      // Modern spec: promptStreaming returns an AsyncIterable
      for await (const chunk of stream) {
        // Chunks are cumulative in the current Chrome implementation
        responseText = chunk; 
        onProgress(responseText);
      }
    } else {
      responseText = await session.prompt(prompt);
    }

    const cleanedJson = extractJson(responseText);
    const result = importScenarioFromJson(cleanedJson);

    if (result.success) {
      return { success: true, config: result.config, rawResponse: responseText };
    }

    return { 
      success: false, 
      error: `JSON Logic Error: ${result.error}`, 
      rawResponse: responseText 
    };

  } catch (error: any) {
    return { 
      success: false, 
      error: `AI Generation Failed: ${error?.message || 'Unknown error'}` 
    };
  } finally {
    if (session) {
      if (typeof session.destroy === 'function') session.destroy();
      else if (typeof session.close === 'function') session.close();
    }
  }
}

function getStatusMessage(status: AIAvailability): string {
  switch (status) {
    case 'downloadable': return 'AI model needs to be downloaded first.';
    case 'downloading': return 'AI model is currently downloading...';
    case 'unavailable': return 'Chrome Prompt API is not available or unsupported.';
    default: return 'AI is ready.';
  }
}
