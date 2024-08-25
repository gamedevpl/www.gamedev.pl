import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'build',
  },
  resolve: {
    preserveSymlinks: true,
  },
  plugins: [
    react(),
    checker({ typescript: true }),
    viteStaticCopy({
      targets: [
        {
          src: 'build/index.html',
          dest: 'games/nukes',
        },
        {
          src: '../games/monster-steps/dist',
          dest: 'games/',
          rename: 'monster-steps',
        },
      ],
    }),
  ],
});
