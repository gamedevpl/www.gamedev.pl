import { renderToString } from 'react-dom/server';
import { PlayShell } from './shell.js';
export const markup = renderToString(<PlayShell />);
