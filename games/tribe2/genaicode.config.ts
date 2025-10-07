import { defineConfig } from 'genaicode';

export default defineConfig({
  rootDir: '.',
  ignorePaths: [
    'dist',
    'node_modules',
    'package-lock.json',
    'tfmodel/weights.bin',
    'tfmodel/model.json',
    'result-chain.cache.json',
    'simulate.cache.json',
  ],
  projectCommands: {
    install: {
      command: 'npm install',
      description: 'Install project dependencies',
      autoApprove: true,
    },
    build: {
      command: 'npm run build',
      description: 'Build the project',
      autoApprove: true,
    },
    typeCheck: {
      command: 'npm run type-check',
      description: 'Run TypeScript type checking',
      autoApprove: true,
    },
    lint: {
      command: 'npm run lint',
      description: 'Run ESLint to check code quality',
      autoApprove: true,
    },
    test: {
      command: 'npm run test',
      description: 'Run unit tests',
      autoApprove: true,
    },
  },
});
