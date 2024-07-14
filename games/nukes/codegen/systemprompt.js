import assert from 'node:assert';

import { getSourceCode } from './read-files.js';
import { CODEGEN_TRIGGER } from './prompt-consts.js';
import { codegenOnly, gameOnly, verbosePrompt } from './cli-params.js';
import { verify } from 'node:crypto';
import { verifySystemPromptLimit } from './limits.js';

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

  You can generate new code, or modify the existing one. You will receive instructions on what is the goal of requested code modification.

  Instructions will be passed to you either directly via message or using a file or by using special ${CODEGEN_TRIGGER} comment in the code.

  You will be using the \`updateFile\` and \`explanation\` functions in response.

  The \`updateFile\` should be used to suggest code changes, it takes two arguments: 
   - \`filePath\`: path to the file, if file does not exist, it will be created
   - \`newContent\`: the entire content of the new file, empty string means delete the file.
   - \`reasoning\`: explanation of why the file was changed

  The \`explanation\` function should be used to provide reasoning for code changes or lack of code change. It takes only one \`text\` argument.

  Parse my application source code and make changes using the \`updateFile\` and \`explanation\` functions.
  `;

  if (verbosePrompt) {
    console.log('System prompt:');
    console.log(systemPrompt);
  }

  verifySystemPromptLimit(systemPrompt);

  return systemPrompt;
}