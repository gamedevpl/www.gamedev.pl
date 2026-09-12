import { localModels } from './model-catalog.js';
import { loadAdapters, whichOnPath } from './adapters.js';
import { effortChoices, readAgentSelection, saveAgentSelection, selectionLabel } from './agent-settings.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';
import type { PickChoice } from './workshop.js';

export async function modelCommand(input: {
  args: string[];
  flags: Record<string, string | boolean>;
  env: NodeJS.ProcessEnv;
  pick?: PickChoice;
  write: (text: string) => void;
}): Promise<void> {
  const adapters = loadAdapters(input.env).adapters;
  let agent = input.args[0];
  if (!agent && input.pick) {
    const installed = adapters.filter((spec) => whichOnPath(spec.command, input.env));
    if (!installed.length) throw new CliError('no local agents found', EXIT_INPUT, '/agents');
    agent = await input.pick(
      installed.map((spec) => spec.name),
      'Model settings for which agent?',
    );
  }
  if (!agent) {
    if (Object.keys(input.flags).length)
      throw new CliError('choose an agent first', EXIT_INPUT, 'model <agent> --model <id> --effort <level>');
    for (const spec of adapters) input.write(selectionLabel(spec.name, readAgentSelection(spec.name, input.env)));
    input.write('model <agent> --model <id> --effort <level>; --reset restores tool defaults');
    return;
  }
  if (agent.startsWith('/')) return;
  if (!adapters.some((spec) => spec.name === agent)) throw new CliError('unknown agent', EXIT_INPUT, '/agents');
  let selected = readAgentSelection(agent, input.env);
  const explicit = Object.keys(input.flags).length > 0;
  if (!explicit && !input.pick) {
    input.write(selectionLabel(agent, selected));
    return;
  }
  if (input.flags.reset === true) selected = {};
  else {
    for (const key of ['model', 'effort'] as const) {
      const value = input.flags[key];
      if (value !== undefined && typeof value !== 'string')
        throw new CliError(`${key} needs a value`, EXIT_INPUT, `--${key} <value>`);
      if (typeof value === 'string') selected = { ...selected, [key]: value === 'default' ? undefined : value };
    }
    if (!explicit && input.pick) {
      input.write(selectionLabel(agent, selected));
      const choice = await input.pick(
        ['Keep current settings', 'Change model and effort', 'Use tool defaults'],
        'Agent settings',
      );
      if (choice === 'Use tool defaults') selected = {};
      else if (choice === 'Change model and effort') {
        const models = localModels(agent, input.env);
        const picked = models.length
          ? await input.pick(
              ['default', ...models.map((row) => row.id), 'Enter model ID'],
              'Model (local catalog; availability may change)',
            )
          : 'Enter model ID';
        if (picked.startsWith('/')) return;
        if (picked === 'Enter model ID')
          input.write('Enter a model ID supported by your agent, or default to use its configuration:');
        const model = picked === 'Enter model ID' ? (await input.pick([], 'Model ID')).trim() : picked;
        if (!model || model.startsWith('/')) return;
        selected = { model: model === 'default' ? undefined : model };
        const choices = models.find((row) => row.id === model)?.efforts ?? effortChoices(agent);
        if (choices.length) {
          const effort = await input.pick(
            ['default', ...choices],
            'Reasoning effort (availability depends on the model)',
          );
          if (effort.startsWith('/')) return;
          if (effort !== 'default') selected.effort = effort;
        }
      } else return;
    }
  }
  saveAgentSelection(agent, selected, input.env);
  input.write(`Saved: ${selectionLabel(agent, selected)}. Applies to future delegations.`);
}
