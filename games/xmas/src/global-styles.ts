import { createGlobalStyle } from 'styled-components';
import '@fontsource/press-start-2p';

export const GlobalStyles = createGlobalStyle`
:root {
  /* Typography */
  font-family: 'Press Start 2P', system-ui;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 400;

  /* Colors */
  --color-text: rgba(255, 255, 255, 0.87);
  --color-background: #242424;
  --color-primary: #4caf50;
  --color-primary-dark: #45a049;
  --color-primary-darker: #2E7D32;
  --color-accent: #FFD700;
  --color-night-sky-start: #0B1026;
  --color-night-sky-end: #1B2949;

  /* Animation Speeds */
  --animation-speed-slow: 3s;
  --animation-speed-medium: 2s;
  --animation-speed-fast: 0.3s;

  /* Z-index Layers */
  --z-background: 0;
  --z-decorative: 1;
  --z-content: 2;
  --z-overlay: 3;

  /* Responsive Breakpoints */
  --breakpoint-mobile: 480px;
  --breakpoint-tablet: 768px;
  --breakpoint-desktop: 1024px;

  /* Theme */
  color-scheme: light dark;
  color: var(--color-text);
  background-color: var(--color-background);

  /* Rendering */
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Animation defaults */
  --animation-curve: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Consistent input and button styling */
input, button {
  font-family: 'Press Start 2P', system-ui;
  transition: all var(--animation-speed-fast) var(--animation-curve);
}

/* Focus styles for accessibility */
*:focus {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

/* Touch device optimizations */
@media (hover: hover) {
  button:hover {
    transform: translateY(-2px);
  }
}

/* Base layout */
body {
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--color-background);
  overscroll-behavior: none;
  touch-action: none;
  user-select: none;

  /* Prevent scrolling on mobile devices */
  position: fixed;
  width: 100%;
  height: 100%;
  overflow: hidden;

  > #root {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    position: relative;
  }
}

/* Responsive typography */
@media (max-width: var(--breakpoint-mobile)) {
  :root {
    font-size: 11px;
  }
}

@media (max-width: var(--breakpoint-tablet)) {
  :root {
    font-size: 12px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :root {
    --color-text: white;
    --color-background: black;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Print styles */
@media print {
  body {
    background: white;
  }
  
  #root {
    display: none;
  }
}
`;