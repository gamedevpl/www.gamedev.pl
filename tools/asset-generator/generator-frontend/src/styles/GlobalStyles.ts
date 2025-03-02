/**
 * GlobalStyles Component
 * 
 * Defines global styles for the application using styled-components.
 * These styles replace the original styles.css file.
 */

import { createGlobalStyle } from 'styled-components';

const GlobalStyles = createGlobalStyle`
  /* CSS Variables */
  :root {
    --primary-color: #4a6fa5;
    --primary-hover: #5d84be;
    --secondary-color: #f8f9fa;
    --text-color: #333;
    --border-color: #ddd;
    --success-color: #28a745;
    --warning-color: #ffc107;
    --error-color: #dc3545;
    --shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    --border-radius: 4px;
    --transition: all 0.3s ease;
  }

  /* Reset and base styles */
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    line-height: 1.6;
    color: var(--text-color);
    background-color: #f5f5f5;
  }

  /* Typography */
  h1, h2, h3, h4, h5, h6 {
    margin-bottom: 0.5rem;
    font-weight: 500;
    line-height: 1.2;
  }

  p {
    margin-bottom: 1rem;
  }

  /* Form elements */
  label {
    font-weight: 500;
    display: block;
    margin-bottom: 0.25rem;
  }

  select, input[type="text"], input[type="number"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-size: 1rem;
    transition: var(--transition);
  }

  select:focus, input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(74, 111, 165, 0.2);
  }

  input[type="range"] {
    width: 100%;
    margin: 0.5rem 0;
  }

  button {
    cursor: pointer;
  }

  /* Status messages */
  .status-message {
    padding: 0.75rem;
    margin: 1rem 0;
    border-radius: var(--border-radius);
    font-weight: 500;
  }

  .status-message.success {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  .status-message.error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .status-message.info {
    background-color: #d1ecf1;
    color: #0c5460;
    border: 1px solid #bee5eb;
  }

  /* Lion specific styles */
  .color-option {
    display: inline-block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 0.5rem;
    border: 2px solid transparent;
    cursor: pointer;
    transition: var(--transition);
  }

  .color-option.selected {
    border-color: var(--primary-color);
    transform: scale(1.1);
  }

  .color-option.default {
    background-color: #e8b06d;
  }

  .color-option.golden {
    background-color: #ffd700;
  }

  .color-option.white {
    background-color: #f8f8ff;
    border: 2px solid #ddd;
  }
`;

export default GlobalStyles;