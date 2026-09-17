import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PlayShell } from './shell.js';
import '../../web/src/core/styles/tokens.css';
import './style.css';
import './drawers.css';
flushSync(() => createRoot(document.getElementById('workbench')!).render(<PlayShell />));
