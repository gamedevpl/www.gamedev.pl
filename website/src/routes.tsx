import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Games from "./games";
import WarGames from "./games/wargames";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/games",
    element: <Games />,
  },
  {
    path: "/games/wargames",
    element: <WarGames />,
  },
]);

export default function Routes() {
  return <RouterProvider router={router} />;
}
