import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PlayShell } from './shell.js';
import { initializeWorkbenchResize } from './workbench-resize.js';
import '../../web/src/core/styles/tokens.css';
import './style.css';
import '../../web/src/surfaces/studio/code-surface-editor.css';
import './code-panel.css';
import './build-error.css';
import './panel-resize.css';
import './code-resize.css';
import './drawers.css';
import './home.css';
import './transcript.css';
import './diff-flyout.css';
import './responsive.css';
flushSync(() => createRoot(document.getElementById('workbench')!).render(<PlayShell />));

initializeWorkbenchResize();
