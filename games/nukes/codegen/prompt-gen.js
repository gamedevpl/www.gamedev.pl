import { sourceCode } from './read-files.js';

function generatePrompt() {
  console.log('Generate system prompt');
  let systemPrompt = 'This is the source code of the application:';

  for (const [path, content] of Object.entries(sourceCode)) {
    // file path, content wrapped in markdown code block
    systemPrompt += `\n\`${path}\`:\`\`\`\n${content}\n\`\`\`\n`;
  }

  return systemPrompt;
}

export const systemPrompt = generatePrompt();

export const codeGenPrompt = `
    Your goal is to help me generate code for my ideas in my application the source code have been given.

    I have marked fragments I want you to generate with two comments:
    - \`// CODEGEN START\`
    - \`// CODEGEN END\`

    For example this fragment:
    \`\`\` 
    // CODEGEN START
    // print hello world to console
    // CODEGEN END
    \`\`\`

    should probably result in:
    \`\`\`
    console.log("hello world");
    \`\`\`
    (note that comments were removed, and the instruction was also removed, and replaced with final code)

    Parse my application source code and find the fragments, and replace them with code accordingly to the context and instructions.
    I would prefer to not update files which do not contain valid aforementioned fragments marked with comments, so 
    if there are not codegen comments, do not propose modification of that file.

    Return your response as a json in this format:
    \`\`\`
    {
        "filepath": "new file content"
    }
    \`\`\`
    Make sure to return a valid JSON that will work with JSON.stringify
`;
