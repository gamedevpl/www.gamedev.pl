export default {
  rootDir: '.',
  importantContext: {
    files: ['README.md', 'tsconfig.json'],
  },
  extensions: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.json', '.md', '.css', '.html'],
  ignorePaths: ['dist', 'build', 'node_modules', 'package-lock.json'],
  modelOverrides: {
    aiStudio: {
      default: 'gemini-3.1-pro-preview',
      cheap: 'gemini-3-flash-preview',
    },
  },
};
