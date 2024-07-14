import assert from 'node:assert';
import OpenAI from 'openai';
import { explanationFD, updateFileFD } from './function-calling.js';

/**
 * This function generates content using the OpenAI chat model.
 *
 * @param systemPrompt System prompt for the chat model
 * @param prompt Prompt for the chat model
 * @returns Array of function calls
 */
export async function generateContent(systemPrompt, prompt) {
  const openai = new OpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    tools: [
      { type: 'function', function: updateFileFD },
      { type: 'function', function: explanationFD },
    ],
    tool_choice: 'required',
  });

  // Print token usage for chat gpt
  console.log('Token Usage:');
  console.log('  - Completion tokens: ', response.usage.completion_tokens);
  console.log('  - Prompt tokens: ', response.usage.prompt_tokens);
  console.log('  - Total tokens: ', response.usage.total_tokens);

  // Calculate and print the estimated cost
  const inputCost = response.usage.prompt_tokens * 0.000005;
  const outputCost = response.usage.completion_tokens * 0.000015;
  const totalCost = inputCost + outputCost;
  console.log('  - Estimated cost: ', totalCost.toFixed(6), ' USD');

  const responseMessage = response.choices[0].message;

  if (responseMessage.content?.message) {
    console.log('Message', responseMessage.content.message);
  }

  const toolCalls = responseMessage.tool_calls;
  if (responseMessage.tool_calls) {
    const functionCalls = toolCalls.map((call) => {
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments);

      assert(name === 'updateFile' || name === 'explanation', 'Invalid tool call: ' + name);

      return {
        name,
        args,
      };
    });

    console.log(
      'Explanations:',
      functionCalls.filter((fn) => fn.name === 'explanation').map((call) => call.args.text),
    );

    return functionCalls.filter((fn) => fn.name === 'updateFile').map((call) => call.args);
  } else {
    throw new Error('No tool calls found in response');
  }
}
