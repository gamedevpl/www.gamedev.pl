// In src/vite-env.d.ts

/// <reference types="vite/client" />

declare module '*.mp3' {
  const src: string;
  export default src;
}
