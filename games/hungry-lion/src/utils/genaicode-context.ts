import { contextManager } from 'genaicode/vite-context';

// Those functions can be used to store and retrieve app context data in GenAICode:
// - GenAIcode can use this data to optimize the code generation process
// - GenAIcode can update context to modify the application behavior

export async function updateAppContext(key: string, value: string) {
  await contextManager.setContext(key, value);
}

export async function getAppContext(key: string) {
  return await contextManager.getContext(key);
}
