import assert from 'node:assert';

import { getSourceCode } from './read-files.js';
import { CODEGEN_TRIGGER } from './prompt-consts.js';
import { codegenOnly, gameOnly } from './cli-params.js';

/** Generates a system prompt */
export function getSystemPrompt() {
  console.log('Generate system prompt');

  assert(!codegenOnly || !gameOnly, 'codegenOnly and gameOnly cannot be true at the same time');

  let systemPrompt = `
  I want you to help me generate code for my ideas in my application the source code have been given:
  ${gameOnly ? '' : `- codegen: node.js script that helps me generate code using Vertex AI, it is using javascript`}
  ${
    codegenOnly
      ? ''
      : `- src: React application that will run in a browser, it is using typescript

  The application is a game where the player can launch missiles towards various targets like cities, launch sites or other missiles.
  The goal of the game is to win as a state, meaning to be the only state with non zero population.`
  }

  This is the source code of the application:
  \`\`\`json
  ${JSON.stringify(getSourceCode(), null, 2)}
  \`\`\`
  (format of this JSON object is: \`{ [filePath: string]: string }\`)

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
  /* 
   * ${CODEGEN_TRIGGER}
   * fix a bug in this code, item is sometimes undefined 
   */
  const output = input.map(item => item.toUpperCase());
  \`\`\`

  should result in:
  \`\`\`
  const output = input.map(item => item?.toUpperCase());
  \`\`\`
  (also note that the comment was removed)

  You will be using the \`updateFile\` and \`explanation\` functions in response.

  The \`updateFile\` should be used to suggest code changes, it takes two arguments: 
   - \`filePath\`: path to the file, if file does not exist, it will be created
   - \`newContent\`: the entire content of the new file, empty string means delete the file.
   - \`reasoning\`: explanation of why the file was changed

  The \`explanation\` function should be used to provide reasoning for code changes or lack of code change. It takes only one \`text\` argument.

  Parse my application source code and make changes using the \`updateFile\` and \`explanation\` functions.
  `;

  console.log('System prompt:');
  console.log(systemPrompt);

  return systemPrompt;
}
