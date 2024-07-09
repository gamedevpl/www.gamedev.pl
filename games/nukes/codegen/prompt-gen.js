import assert from 'node:assert';
import { sourceCode } from './read-files.js';
import { CODEGEN_END, CODEGEN_START } from './prompt-consts.js';

const considerAllFiles = process.argv.includes('--consider-all-files');
const allowFileCreate = process.argv.includes('--allow-file-create');
const allowFileDelete = process.argv.includes('--allow-file-delete');

function generatePrompt() {
  console.log('Generate system prompt');
  let systemPrompt = `
  I want you to help me generate code for my ideas in my application the source code have been given:
  - codegen: node.js script that helps me generate code using Vertex AI
  - src: React application that will run in a browser

  The application is a game where the player can launch missiles towards various targets like cities, launch sites or other missiles.
  The goal of the game is to win as a state, meaning to be the only state with non zero population.

  This is the source code of the application:
  \`\`\`
  ${JSON.stringify(sourceCode, null, 2)}
  \`\`\`

  I have marked fragments I want you to generate with two comments:
  - \`// ${CODEGEN_START}: some hints for you\`
  - \`// ${CODEGEN_END} END\`

  For example this fragment:
  \`\`\` 
  console.log('Some other statement');
  // ${CODEGEN_START}: print hello world to console
  // ${CODEGEN_END}
  console.log('Yet another statement');
  \`\`\`

  should probably result in:
  \`\`\`
  console.log('Some other statement');
  console.log("hello world");
  console.log('Yet another statement');
  \`\`\`
  (note that comments were removed, and the instruction was also removed, and replaced with final code)

  Parse my application source code and find the fragments, and replace them with code accordingly to the context and instructions.  

  Return your response as a json in this format:
  \`\`\`
  {
      "filepath": "new file content"
  }
  \`\`\`
  `;

  return systemPrompt;
}

export const systemPrompt = generatePrompt();

const codeGenFiles = Object.entries(sourceCode)
  .filter(([path, content]) => (considerAllFiles ? true : content.includes(`// ${CODEGEN_START}`)))
  .map(([path]) => path);

assert(codeGenFiles.length > 0, 'No codegen files found');

console.log('Code gen files:', codeGenFiles);

export const codeGenPrompt = `${
  considerAllFiles
    ? `I have marked some files with the ${CODEGEN_START} fragments:`
    : 'Generate updates only for the following files:'
}
${codeGenFiles.join('\n')}

Make sure to return a valid JSON that will work with JSON.parse
${
  considerAllFiles
    ? 'You are allowed to modify files which do not contain the fragments.'
    : 'Do not modify files which do not contain the fragments.'
}
${allowFileCreate ? 'You are allowed to create new files.' : 'Do not create new files.'}
${
  allowFileDelete
    ? 'You are allowed to delete files, in such case add empty string for their path in output JSON.'
    : 'Do not delete files.'
}
Do not not output files if there are no changes.
If there are no files to be changed, return an empty object.
`;
