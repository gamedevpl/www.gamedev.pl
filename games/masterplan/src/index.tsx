import React from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from './global-styles';
import { OldApp } from './old-app';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <GlobalStyles />
    <OldApp />
  </React.StrictMode>,
);
