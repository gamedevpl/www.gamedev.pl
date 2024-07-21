import Anthropic from '@anthropic-ai/sdk';
import { createFileFD, deleteFileFD, explanationFD, updateFileFD, createDirectoryFD } from './function-calling.js';

/**
 * This function generates content using the Anthropic Claude model.
 *
 * @param systemPrompt System prompt for the chat model
 * @param prompt Prompt for the chat model
 * @returns Array of function calls
 */
export async function generateContent(systemPrompt, prompt) {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    tools: [createFileFD, updateFileFD, deleteFileFD, explanationFD, createDirectoryFD].map((fd) => ({
      name: fd.name,
      description: fd.description,
      input_schema: fd.parameters,
    })),
    tool_choice: { type: 'any' },
    max_tokens: 4096,
  });

  // Print token usage for Anthropic
  console.log('Token Usage:');
  console.log('  - Input tokens: ', response.usage.input_tokens);
  console.log('  - Output tokens: ', response.usage.output_tokens);
  console.log('  - Total tokens: ', response.usage.input_tokens + response.usage.output_tokens);

  // Calculate and print the estimated cost
  const inputCost = (response.usage.input_tokens * 3) / 1000 / 1000;
  const outputCost = (response.usage.output_tokens * 15) / 1000 / 1000;
  const totalCost = inputCost + outputCost;
  console.log('  - Estimated cost: ', totalCost.toFixed(6), ' USD');

  const responseMessages = response.content.filter((item) => item.type !== 'tool_use');
  if (responseMessages.length > 0) {
    console.log('Response messages', responseMessages);
  }

  const functionCalls = response.content.filter((item) => item.type === 'tool_use');

  const explanations = functionCalls.filter((call) => call.name === 'explanation');
  console.log(
    'Explanations',
    explanations.map((item) => item.input.text),
  );

  return functionCalls
    .filter(
      (call) =>
        call.name === 'updateFile' ||
        call.name === 'createFile' ||
        call.name === 'deleteFile' ||
        call.name === 'createDirectory',
    )
    .map((item) => ({ name: item.name, args: item.input }));
}
