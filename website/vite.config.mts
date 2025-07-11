import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import genaicodeVite from 'genaicode/vite-plugin';

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
    genaicodeVite({
      imagen: 'vertex-ai',
    }),
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
        {
          src: '../games/hungry-lion/dist',
          dest: 'games/',
          rename: 'hungry-lion',
        },
        {
          src: '../games/tribe/dist',
          dest: 'games/',
          rename: 'tribe',
        },
      ],
    }),
  ],
});
