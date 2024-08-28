import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => ({ Component: (await import('./App.tsx')).App }),
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
