import { GenerateContentFunction } from 'genaicode';
import { generateContent as generateContentAiStudio } from 'genaicode/ai-service/ai-studio.js';
import { generateContent as generateContentAnthropic } from 'genaicode/ai-service/anthropic.js';

export const generateContent: GenerateContentFunction = generateContentAiStudio;
export const generateCode: GenerateContentFunction = generateContentAnthropic;
