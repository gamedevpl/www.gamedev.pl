import assert from 'node:assert';
import { sourceCode } from './read-files.js';
import { CODEGEN_TRIGGER } from './prompt-consts.js';

const considerAllFiles = process.argv.includes('--consider-all-files');
const allowFileCreate = process.argv.includes('--allow-file-create');
const allowFileDelete = process.argv.includes('--allow-file-delete');

function generatePrompt() {
  console.log('Generate system prompt');
  let systemPrompt = `
  I want you to help me generate code for my ideas in my application the source code have been given:
  - codegen: node.js script that helps me generate code using Vertex AI, it is using javascript
  - src: React application that will run in a browser, it is using typescript

  The application is a game where the player can launch missiles towards various targets like cities, launch sites or other missiles.
  The goal of the game is to win as a state, meaning to be the only state with non zero population.

  This is the source code of the application:
  \`\`\`
  ${JSON.stringify(sourceCode, null, 2)}
  \`\`\`

  I have marked fragments I want you to generate with a comments:
  - \`// ${CODEGEN_TRIGGER}: instruction for you\` or \`/* ${CODEGEN_TRIGGER}: some hints for you\ */\`

  For example this fragment:
  \`\`\` 
  console.log('Some other statement');
  // ${CODEGEN_TRIGGER}: print hello world to console
  console.log('Yet another statement');
  \`\`\`

  should result in:
  \`\`\`
  console.log('Some other statement');
  console.log("hello world");
  console.log('Yet another statement');
  \`\`\`
  (note that comment was removed, and the instruction was also removed, and replaced with final code)

  Another example with multiline instruction:
  \`\`\` 
  /* ${CODEGEN_TRIGGER}: fix a bug in this code, item is sometimes undefined */
  const output = input.map(item => item.toUpperCase());
  \`\`\`

  should result in:
  \`\`\`
  const output = input.map(item => item?.toUpperCase());
  \`\`\`

  Parse my application source code and suggest changes.

  You will be using the \`updateFile\` and \`explanation\` functions in response.

  The \`updateFile\` should be used to suggest code changes, it takes two arguments: 
   - \`filePath\`: path to the file, if file does not exist, it will be created
   - \`newContent\`: the entire content of the new file, empty string means delete the file
   - \`reasoning\`: explanation of why the file was changed

  The \`explanation\` function should be used to provide reasoning for code changes or lack of code change. It takes only one \`text\` argument.
  `;

  return systemPrompt;
}

export const systemPrompt = generatePrompt();

const codeGenFiles = Object.entries(sourceCode)
  .filter(([path, content]) => content.includes(CODEGEN_TRIGGER))
  .map(([path]) => path);

if (!considerAllFiles) {
  assert(codeGenFiles.length > 0, 'No codegen files found');
  console.log('Code gen files:');
  console.log(codeGenFiles);
}

export const codeGenPrompt = `${
  considerAllFiles
    ? codeGenFiles.length > 0
      ? `I have marked some files with the ${CODEGEN_TRIGGER} fragments:\n${codeGenFiles.join('\n')}`
      : `No files are marked with ${CODEGEN_TRIGGER} fragment, so you can consider doing changes in any file.`
    : `Generate updates only for the following files:\n${codeGenFiles.join('\n')}`
}

${
  considerAllFiles
    ? 'You are allowed to modify files which do not contain the fragments.'
    : 'Do not modify files which do not contain the fragments.'
}
${allowFileCreate ? 'You are allowed to create new files.' : 'Do not create new files.'}
${
  allowFileDelete
    ? 'You are allowed to delete files, in such case add empty string for their path in output JSON.'
    : 'Do not delete files, empty content means something would be deleted.'
}
Do not output files if there are no changes.
If there are no files to be changed, do not call \`updateFile\` function, but make sure the explain your reasning with \`explanation\` function.
`;

console.log('Code gen prompt:');
console.log(codeGenPrompt);
