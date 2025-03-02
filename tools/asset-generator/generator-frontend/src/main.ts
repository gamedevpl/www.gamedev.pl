/**
 * Asset Generator Preview - React Entry Point
 *
 * Main entry point for the React asset preview application.
 * This file initializes the React application and mounts it to the DOM.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import GlobalStyles from './styles/GlobalStyles';

// Create root and render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(React.Fragment, null, React.createElement(GlobalStyles), React.createElement(App)),
  ),
);
