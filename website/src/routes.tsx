import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => ({ Component: (await import('./App.tsx')).App }),
  },
  {
    path: '/games/nukes',
    lazy: async () => ({ Component: (await import('./games/nukes/NukesApp.tsx')).NukesApp }),
  },
  {
    path: '/games/monster-steps',
    lazy: async () => ({ Component: (await import('./games/monster-steps/main.tsx')).MonsterStepsApp }),
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
