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
    model: 'gpt-4',
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
