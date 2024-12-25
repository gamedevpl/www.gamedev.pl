import fs from 'fs';
const currentPromptPlugin = {
  name: 'current-prompt-plugin',
  // Example implementation of generateContent hooks
  generateContentHook: async ([prompt]) => {
    fs.writeFileSync(
      './genaicode-debug.js',
      'export const DEBUG_CURRENT_PROMPT = ' + JSON.stringify(prompt, null, 2) + ';',
    );
  },
};
export default currentPromptPlugin;
