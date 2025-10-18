// This file extends the global Window interface to include vendor-prefixed
// properties for cross-browser compatibility.

/// <reference types="@webgpu/types" />

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

interface Window {
  /**
   * The vendor-prefixed version of the AudioContext for Safari and older Chrome browsers.
   */
  webkitAudioContext?: typeof AudioContext;
}
