import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import {routes as nukesRoutes} from "./games/nukes/App.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  ...nukesRoutes,
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
