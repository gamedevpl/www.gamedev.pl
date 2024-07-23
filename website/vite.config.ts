import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "build",
  },
  plugins: [
    react(),
    checker({ typescript: true }),
    viteStaticCopy({
      targets: [
        {
          src: "build/index.html",
          dest: ".",
          rename: "404.html",
        },
      ],
    }),
  ],
});
