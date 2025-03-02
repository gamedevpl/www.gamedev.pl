/**
 * AssetSelector Component
 *
 * A dropdown component for selecting assets from a list of available assets.
 * Displays asset names and calls a callback when selection changes.
 */

import React from 'react';
import styled from 'styled-components';
import { AssetInfo } from '../utils/assetUtils';

interface AssetSelectorProps {
  /** List of available assets */
  availableAssets: AssetInfo[];
  /** Currently selected asset name */
  selectedAssetName?: string;
  /** Callback function called when asset selection changes */
  onSelectAsset: (assetName: string) => void;
  /** Optional CSS class name */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * AssetSelector Component
 */
const AssetSelector: React.FC<AssetSelectorProps> = ({
  availableAssets,
  selectedAssetName,
  onSelectAsset,
  className,
  disabled = false,
}) => {
  // Handle selection change
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectAsset(event.target.value);
  };

  return (
    <Container className={className}>
      <Label htmlFor="asset-selector">Select Asset:</Label>
      <Select id="asset-selector" value={selectedAssetName || ''} onChange={handleChange} disabled={disabled}>
        <option value="" disabled>
          -- Select an asset --
        </option>
        {availableAssets.map((assetInfo) => (
          <option key={assetInfo.name} value={assetInfo.name}>
            {assetInfo.name}
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

export default AssetSelector;
