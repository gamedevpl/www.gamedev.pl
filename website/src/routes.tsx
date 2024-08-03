import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/games/nukes',
    lazy: async () => ({ Component: (await import('./games/nukes/NukesApp.tsx')).NukesApp }),
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
