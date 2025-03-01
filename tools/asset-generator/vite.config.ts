import { defineConfig } from 'vite';
import { resolve } from 'path';
import viteGenaicode from 'genaicode/vite-plugin';

// https://vitejs.dev/config/
export default defineConfig({
  root: '.', // Project root directory

  // Configure the base public path
  base: '/',

  // Configure the build output
  build: {
    outDir: 'dist/preview',
    emptyOutDir: true,
    sourcemap: true,
  },

  // Configure the development server
  server: {
    port: 3000,
    open: true, // Automatically open the browser
    cors: true, // Enable CORS for all requests
  },

  // Resolve aliases for easier imports
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@assets': resolve(__dirname, './src/assets'),
      '@preview': resolve(__dirname, './src/preview'),
      '@components': resolve(__dirname, './src/preview/components'),
    },
  },

  // Configure optimizations
  optimizeDeps: {
    include: [],
    exclude: ['canvas'], // Exclude Node.js canvas module
  },

  // Configure esbuild options for TypeScript
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  },

  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  plugins: [viteGenaicode({})],
});
