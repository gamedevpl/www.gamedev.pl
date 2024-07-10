import { systemPrompt, codeGenPrompt } from './prompt-gen.js';
import { updateFiles } from './update-files.js';
import { generateContent } from './vertex-ai.js';

console.log('Generating response');
const functionCalls = await generateContent(systemPrompt, codeGenPrompt);
console.log('Received function calls:', functionCalls);

// read --dry-run flag from command line
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('Dry run mode, not updating files');
} else {
  console.log('Update files');
  updateFiles(functionCalls);
  console.log('Done!');
}
