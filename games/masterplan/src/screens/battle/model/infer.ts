import { FunctionDef, PromptItem } from 'genaicode/dist/ai-service/common';
import { Unit } from '../../designer/designer-types';
import { MAX_COL, MAX_ROW } from '../consts';
import { countSoldiers } from './units-trim';

export async function generateMasterplan(
  resultChain: {
    reasoning?: string;
    changes?: string;
    name: string;
    units: Unit[];
    result: 'won' | 'lost' | 'drawed';
  }[],
): Promise<{ reasoning: string; changes: string; name: string; units: Unit[] }> {
  const { generateContent } = await import('genaicode/dist/ai-service/anthropic.js');
  const prompt: PromptItem[] = [
    {
      type: 'systemPrompt',
      text: SYSTEM_PROMPT,
    },
    {
      type: 'user',
      text: `Your goal is to create a masterplan that can counter the "${resultChain[0].name}" plan:

\`\`\`
${JSON.stringify(resultChain[0], null, 4)}
\`\`\`
(total soldiers: ${countSoldiers(resultChain[0].units)}, direction of attack: from bottom to top)

I will be able to provide you with feedback on the generated plan based on the result of the battle.`,
    },
    ...resultChain
      .slice(1)
      .map((result, idx) => [
        {
          type: 'assistant',
          text: `I have generated a masterplan for you, it\'s name is "${result.name}", could you please check how it performs against "${resultChain[idx].name}"?`,
          functionCalls: [
            {
              name: 'saveMasterplan',
              args: {
                name: result.name,
                changes: result.changes,
                reasoning: result.reasoning,
                units: result.units,
              },
            },
          ],
        } as PromptItem,
        {
          type: 'user',
          functionResponses: [
            {
              name: 'saveMasterplan',
            },
          ],
          text: `Thank you, I have used the plan "${result.name}" for the next run against the "${resultChain[idx].name}" plan. 
              FYI: It ${result.result} with "${resultChain[idx].name}" plan. You can use this fact to learn that the plan you generated is good or bad.
              Now please generate a new plan, which can win with the "${result.name}" plan. Please think about a new strategy you have not thinked so far, consider different layout which does not have to be symetrical, and different combination of unit types. Even very unusual setups are encouraged, because sometimes this may pay off.`,
          cache: idx > resultChain.length - 3,
        } as PromptItem,
      ])
      .flat(),
  ];

  const [saveMasterplan] = await generateContent(prompt, FUNCTION_DEFS, 'saveMasterplan', 0.5, false, {
    aiService: 'anthropic',
  });

  return {
    name: saveMasterplan.args?.name as string,
    units: saveMasterplan.args?.units as Unit[],
    reasoning: saveMasterplan.args?.reasoning as string,
    changes: saveMasterplan.args?.changes as string,
  };
}

const SYSTEM_PROMPT = `Your task is to generate a masterplan for a battle, please adhere to the following requirements:
- The masterplan should contain units of type 'archer', 'warrior', 'artillery', and 'tank'.
- Each unit should have a 'col' and 'row' property that specifies its position on the battlefield, the left top corner of the unit rectangle.
- Each unit should have a 'sizeCol' and 'sizeRow' property that specifies its size on the battlefield.
- The 'col' and 'row' properties should be integers.
- The 'sizeCol' and 'sizeRow' properties should be integers.
- The 'sizeCol' and 'sizeRow' properties should be greater than 0.
- The 'sizeCol' and 'sizeRow' properties should be less than or equal to 4.
- Units must not overlap.
- The total number of soldiers should be more or less equal to 104 (sum of all sizeCol * sizeRow).
- The center of the battlefield should be at (0, 0)
- The direction of attack for the masterplan is from the top of the battlefield to the bottom.
- The masterplan must fit in the rectangle: (-${MAX_COL / 2}, -${MAX_ROW / 2}) to (${MAX_COL / 2}, ${MAX_ROW / 2}).
- Units advance forward, wait, or flank left/right.
- Units will seek to attack the enemy units, and avoid friendly fire.

Characteristics of the units:

- Tanks are slow, durable, and deal high damage.
- Archers are ranged units.
- Warriors are melee units, they are fast and deal moderate damage.
- Artillery is a long-range unit, it deals high damage but has low health, does not move, and can attack only 2 times (then disappears). Can cause friendly fire.`;

const FUNCTION_DEFS: FunctionDef[] = [
  {
    name: 'saveMasterplan',
    description: 'Saves the masterplan',
    parameters: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description: 'Reasoning behind the new plan, observations about the plan it is supposed to counter.',
        },
        changes: {
          type: 'string',
          description: 'Changes made to the plan compared to to the previous one.',
        },
        name: {
          type: 'string',
          description: 'Name of the plan',
        },
        units: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['archer', 'warrior', 'artillery', 'tank'],
              },
              col: {
                type: 'number',
              },
              row: {
                type: 'number',
              },
              sizeCol: {
                type: 'number',
              },
              sizeRow: {
                type: 'number',
              },
              command: {
                type: 'string',
                enum: ['advance-wait', 'advance', 'wait-advance', 'flank-left', 'flank-right'],
              },
            },
          },
          required: ['type', 'col', 'row', 'sizeCol', 'sizeRow', 'command'],
        },
      },
      required: ['reasoning', 'changes', 'units'],
    },
  },
];
