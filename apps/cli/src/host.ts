import { createInterface } from 'node:readline/promises';

export type PromptHost = {
  writeLine: (text: string) => void;
  prompt: (question: string) => Promise<string>;
  close: () => void;
};

export function createReadlineHost(io: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream }): PromptHost {
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  return {
    writeLine(text) {
      io.stdout.write(`${text}\n`);
    },
    prompt(question) {
      return rl.question(question);
    },
    close() {
      rl.close();
    },
  };
}
