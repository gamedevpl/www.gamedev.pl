import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders something", () => {
  render(<App />);
  const linkElement = screen.getByText(/O Gamedev.pl/i);
  expect(linkElement).toBeInTheDocument();
});
