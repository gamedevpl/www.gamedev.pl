import { GenerateContentFunction } from 'genaicode';
import { generateContent as generateContentAiStudio } from 'genaicode/ai-service/ai-studio.js';

export const generateContent: GenerateContentFunction = generateContentAiStudio;
export const generateCode: GenerateContentFunction = generateContentAiStudio;
