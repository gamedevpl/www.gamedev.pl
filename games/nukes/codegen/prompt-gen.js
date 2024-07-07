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
    console.log('Some other statement');
    // CODEGEN START
    // print hello world to console
    // CODEGEN END
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
    Make sure to return a valid JSON that will work with JSON.parse
    Do not modify files which do not contain the fragments
    Do not not output files if there are no changes.
    If there are no files to be changed, return an empty object.
`;
