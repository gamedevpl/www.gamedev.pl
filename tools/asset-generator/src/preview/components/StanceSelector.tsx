/**
 * StanceSelector Component
 *
 * A dropdown component for selecting animation stances from a list of available stances.
 * Displays stance names and calls a callback when selection changes.
 */

import React from 'react';
import styled from 'styled-components';

interface StanceSelectorProps {
  /** List of available stances */
  availableStances: string[];
  /** Currently selected stance */
  selectedStance?: string;
  /** Callback function called when stance selection changes */
  onSelectStance: (stance: string) => void;
  /** Optional CSS class name */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * StanceSelector Component
 */
const StanceSelector: React.FC<StanceSelectorProps> = ({
  availableStances,
  selectedStance,
  onSelectStance,
  className,
  disabled = false,
}) => {
  // Handle selection change
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectStance(event.target.value);
  };

  return (
    <Container className={className}>
      <Label htmlFor="stance-selector">Select Stance:</Label>
      <Select id="stance-selector" value={selectedStance || ''} onChange={handleChange} disabled={disabled}>
        <option value="" disabled>
          -- Select a stance --
        </option>
        {availableStances.map((stance) => (
          <option key={stance} value={stance}>
            {stance}
          </option>
        ))}
      </Select>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
`;

const Label = styled.label`
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.9rem;
`;

const Select = styled.select`
  padding: 0.6rem;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
  cursor: pointer;
  transition: border-color 0.2s ease-in-out;

  &:hover,
  &:focus {
    border-color: var(--primary-color);
    outline: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  option {
    background-color: var(--background-color);
    color: var(--text-color);
  }
`;

export default StanceSelector;