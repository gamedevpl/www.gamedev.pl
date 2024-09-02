import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders something', () => {
  render(<App />);
  const linkElement = screen.getByText(/Monster Steps/i);
  expect(linkElement).toBeDefined();
});
