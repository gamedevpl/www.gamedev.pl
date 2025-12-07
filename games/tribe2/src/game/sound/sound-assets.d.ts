// Type declaration for MP3 file imports
// In browser/Vite mode, these return asset URLs
// In Node.js/headless mode, we provide empty string stubs

declare module '*.mp3' {
  const content: string;
  export default content;
}
