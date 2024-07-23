import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import {routes as nukesRoutes} from "@gamedevpl/nukes/src/App";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/games/nukes",
    children: nukesRoutes
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
