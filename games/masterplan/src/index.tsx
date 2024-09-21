import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <Routes />
  </React.StrictMode>,
);

const router = createBrowserRouter([
  {
    path: '/games/masterplan/',
    lazy: async () => ({ Component: (await import('./masterplan-app.tsx')).MasterPlanApp }),
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
