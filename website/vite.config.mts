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
          src: '../games/monster-steps/dist',
          dest: 'games/',
          rename: 'monster-steps',
        },
        {
          src: '../games/nukes/build',
          dest: 'games/',
          rename: 'nukes',
        },
        {
          src: '../games/masterplan/dist',
          dest: 'games/',
          rename: 'masterplan',
        },
        {
          src: '../games/xmas/dist',
          dest: 'games/',
          rename: 'xmas',
        },
      ],
    }),
  ],
});
