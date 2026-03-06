export default {
  rootDir: '.',
  lintCommand: 'npm run lint; npm run type-check',
  ignorePaths: [
    'dist',
    'node_modules',
    'package-lock.json',
    'tfmodel/weights.bin',
    'tfmodel/model.json',
    'result-chain.cache.json',
    'simulate.cache.json',
  ],
  importantContext: {
    files: ['./.prettierrc', './.eslintrc.cjs', 'src/game/world-types.ts'],
  },
  modelOverrides: {
    aiStudio: {
      default: 'gemini-3.1-pro-preview',
      cheap: 'gemini-3-flash-preview',
      lite: 'gemini-3.1-flash-lite-preview',
    },
  },
};
