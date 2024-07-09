import { systemPrompt, codeGenPrompt } from './prompt-gen.js';
import { parsePromptResponse } from './prompt-parse.js';
import { updateFiles } from './update-files.js';
import { generateContent } from './vertex-ai.js';

console.log('Generating response');
const promptResponseText = await generateContent(systemPrompt, codeGenPrompt);
console.log('Parse response');
const parsedResponse = parsePromptResponse(promptResponseText);

// read --dry-run flag from command line
const isDryRun = process.argv.includes('--dry-run');
console.log('Parsed response:', parsedResponse);

if (isDryRun) {
  console.log('Dry run mode, not updating files');
} else {
  console.log('Update files');
  updateFiles(parsedResponse);
  console.log('Done!');
}
