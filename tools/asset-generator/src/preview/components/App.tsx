/**
 * App Component
 *
 * Main component for the Asset Generator Preview application.
 * Manages application state and renders the UI structure.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import AssetSelector from './AssetSelector';
import AnimationControls from './AnimationControls';
import StanceSelector from './StanceSelector';
import AssetPropertyControls from './AssetPropertyControls';
import { 
  AssetInfo, 
  getAvailableAssets, 
  renderAssetToCanvas, 
  regenerateAsset,
  getDefaultProperties
} from '../utils/assetUtils';
import { Asset } from '../../assets/assets-types';

/**
 * App Component
 */
export const App: React.FC = () => {
  // Canvas reference
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);

  // State for available assets
  const [availableAssets, setAvailableAssets] = useState<AssetInfo[]>([]);

  // State for selected asset
  const [selectedAssetName, setSelectedAssetName] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // State for selected stance
  const [selectedStance, setSelectedStance] = useState<string>('');

  // State for custom asset properties
  const [customProperties, setCustomProperties] = useState<Record<string, any>>({});

  // State for loading/regenerating indicators
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [regenerationMessage, setRegenerationMessage] = useState<string>('');

  // State for animation
  const [isAnimationPlaying, setIsAnimationPlaying] = useState<boolean>(true);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1.0);
  const [animationProgress, setAnimationProgress] = useState<number>(0);

  // Load available assets on component mount
  useEffect(() => {
    try {
      const assets = getAvailableAssets();
      setAvailableAssets(assets);

      // Select the first asset by default
      if (assets.length > 0) {
        const firstAsset = assets[0].asset;
        setSelectedAssetName(assets[0].name);
        setSelectedAsset(firstAsset);
        
        // Set default stance and properties
        setSelectedStance(firstAsset.stances[0] || '');
        setCustomProperties(getDefaultProperties(firstAsset));
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading assets:', error);
      setIsLoading(false);
    }
  }, []);

  // Set up canvas rendering when selected asset changes
  useEffect(() => {
    if (!selectedAsset || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initial render
    renderAssetToCanvas(
      selectedAsset,
      ctx,
      0,
      selectedStance,
      customProperties
    );
  }, [selectedAsset, selectedStance, customProperties]);

  // Animation loop
  useEffect(() => {
    if (!selectedAsset || !canvasRef.current || !isAnimationPlaying) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTimestamp = 0;
    const animate = (timestamp: number) => {
      // Calculate delta time in seconds
      const deltaTime = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
      lastTimestamp = timestamp;

      // Update animation progress
      setAnimationProgress((prev) => {
        // Increment by delta time * speed, and wrap around at 1
        return (prev + deltaTime * animationSpeed) % 1;
      });

      // Render with current progress
      renderAssetToCanvas(
        selectedAsset,
        ctx,
        animationProgress,
        selectedStance,
        customProperties
      );

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    // Clean up animation loop on unmount or when dependencies change
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [selectedAsset, selectedAssetName, isAnimationPlaying, animationSpeed, availableAssets, animationProgress, selectedStance, customProperties]);

  // Handle asset selection
  const handleAssetSelect = useCallback(
    (assetName: string) => {
      const assetInfo = availableAssets.find((info) => info.name === assetName);
      if (assetInfo) {
        const asset = assetInfo.asset;
        setSelectedAssetName(assetName);
        setSelectedAsset(asset);

        // Reset animation progress when changing assets
        setAnimationProgress(0);
        
        // Reset stance to first available stance
        setSelectedStance(asset.stances[0] || '');
        
        // Reset custom properties to asset defaults
        setCustomProperties(getDefaultProperties(asset));
      }
    },
    [availableAssets],
  );

  // Handle stance selection
  const handleStanceSelect = useCallback((stance: string) => {
    setSelectedStance(stance);
  }, []);

  // Handle property change
  const handlePropertyChange = useCallback((propertyName: string, value: any) => {
    setCustomProperties((prev) => ({
      ...prev,
      [propertyName]: value,
    }));
  }, []);

  // Toggle animation playback
  const handleTogglePlay = useCallback(() => {
    setIsAnimationPlaying((prev) => !prev);
  }, []);

  // Adjust animation speed
  const handleSpeedChange = useCallback((speed: number) => {
    setAnimationSpeed(speed);
  }, []);

  // Regenerate selected asset
  const handleRegenerateAsset = useCallback(() => {
    if (!selectedAssetName || isRegenerating) return;

    regenerateAsset(selectedAssetName, {
      onStart: () => {
        setIsRegenerating(true);
        setRegenerationMessage('Regenerating asset...');
      },
      onSuccess: () => {
        setRegenerationMessage('Asset regenerated successfully! Reloading...');

        // Reload the page to see the changes
        // In a more sophisticated implementation, we would reload just the asset
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      },
      onError: (error) => {
        setIsRegenerating(false);
        setRegenerationMessage(`Error: ${error.message}`);

        // Clear error message after a delay
        setTimeout(() => {
          setRegenerationMessage('');
        }, 5000);
      },
    });
  }, [selectedAssetName, isRegenerating]);

  return (
    <AppContainer>
      <Header>
        <h1>Asset Generator Preview</h1>
      </Header>

      <Main>
        <CanvasContainer>
          {isLoading ? (
            <LoadingMessage>Loading assets...</LoadingMessage>
          ) : (
            <canvas ref={canvasRef} width={800} height={600} />
          )}
        </CanvasContainer>

        <ControlsContainer>
          <AssetSelector
            availableAssets={availableAssets}
            selectedAssetName={selectedAssetName}
            onSelectAsset={handleAssetSelect}
            disabled={isLoading || isRegenerating}
          />

          {selectedAsset && (
            <StanceSelector
              availableStances={selectedAsset.stances}
              selectedStance={selectedStance}
              onSelectStance={handleStanceSelect}
              disabled={isLoading || isRegenerating}
            />
          )}

          <AssetPropertyControls
            asset={selectedAsset}
            propertyValues={customProperties}
            onPropertyChange={handlePropertyChange}
            disabled={isLoading || isRegenerating}
          />

          <AnimationControls
            isPlaying={isAnimationPlaying}
            speed={animationSpeed}
            onTogglePlay={handleTogglePlay}
            onSpeedChange={handleSpeedChange}
            disabled={isLoading || isRegenerating}
          />

          <RegenerateSection>
            <SectionTitle>Asset Generation</SectionTitle>
            <RegenerateButton
              onClick={handleRegenerateAsset}
              disabled={isLoading || isRegenerating || !selectedAssetName}
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate Asset'}
            </RegenerateButton>

            {regenerationMessage && <RegenerationMessage>{regenerationMessage}</RegenerationMessage>}
          </RegenerateSection>
        </ControlsContainer>
      </Main>

      <Footer>
        <p>Asset Generator Preview Tool</p>
      </Footer>
    </AppContainer>
  );
};

// Styled Components for App Layout
const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  h1 {
    font-size: 1.8rem;
    color: var(--primary-color);
  }
`;

const Main = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 1.5rem;

  @media (min-width: 768px) {
    flex-direction: row;
  }
`;

const Footer = styled.footer`
  margin-top: 2rem;
  padding: 1rem 0;
  text-align: center;
  font-size: 0.9rem;
  color: #666;
  border-top: 1px solid var(--border-color);
`;

const CanvasContainer = styled.div`
  position: relative;
  background-color: white;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  flex: 1;
  min-height: 400px;
  display: flex;
  justify-content: center;
  align-items: center;

  @media (min-width: 768px) {
    flex: 2;
  }

  canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

const ControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background-color: var(--secondary-color);
  padding: 1.5rem;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);

  @media (min-width: 768px) {
    flex: 1;
    max-width: 350px;
  }
`;

const LoadingMessage = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  color: var(--text-color);
  font-size: 1.2rem;
`;

const RegenerateSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  margin-top: 1rem;
`;

const SectionTitle = styled.h3`
  font-size: 1rem;
  margin: 0;
  color: var(--text-color);
`;

const RegenerateButton = styled.button`
  padding: 0.8rem 1rem;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--border-radius);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;

  &:hover:not(:disabled) {
    background-color: var(--primary-hover-color, #0056b3);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const RegenerationMessage = styled.div`
  font-size: 0.9rem;
  color: var(--text-color);
  padding: 0.5rem;
  border-radius: var(--border-radius);
  background-color: var(--background-color);
  border: 1px solid var(--border-color);
`;