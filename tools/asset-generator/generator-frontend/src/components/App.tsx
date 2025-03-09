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
import { AssetInfo, getAvailableAssets, renderAssetToCanvas, regenerateAsset } from '../utils/assetUtils';
import { Asset } from '../../../generator-core/src/assets-types';

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

  // State for animation properties
  const [selectedStance, setSelectedStance] = useState<string>('');
  const [selectedDirection, setSelectedDirection] = useState<'left' | 'right'>('right');
  const [animationProgress, setAnimationProgress] = useState<number>(0);

  // State for loading/regenerating indicators
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [regenerationMessage, setRegenerationMessage] = useState<string>('');
  const [regenerationPrompt, setRegenerationPrompt] = useState<string>('');

  // State for animation
  const [isAnimationPlaying, setIsAnimationPlaying] = useState<boolean>(true);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1.0);

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

        // Set default stance and direction
        setSelectedStance(firstAsset.stances[0] || '');
        setSelectedDirection('right');
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
    renderAssetToCanvas(selectedAsset, ctx, animationProgress, selectedStance, selectedDirection);
  }, [selectedAsset, selectedStance, selectedDirection, animationProgress]);

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
      renderAssetToCanvas(selectedAsset, ctx, animationProgress, selectedStance, selectedDirection);

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
  }, [
    selectedAsset,
    selectedAssetName,
    isAnimationPlaying,
    animationSpeed,
    availableAssets,
    animationProgress,
    selectedStance,
    selectedDirection,
  ]);

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

        // Set direction from default state
        setSelectedDirection('right');
      }
    },
    [availableAssets],
  );

  // Handle stance selection
  const handleStanceSelect = useCallback((stance: string) => {
    setSelectedStance(stance);
  }, []);

  // Handle direction selection
  const handleDirectionSelect = useCallback((direction: 'left' | 'right') => {
    setSelectedDirection(direction);
  }, []);

  // Toggle animation playback
  const handleTogglePlay = useCallback(() => {
    setIsAnimationPlaying((prev) => !prev);
  }, []);

  // Adjust animation speed
  const handleSpeedChange = useCallback((speed: number) => {
    setAnimationSpeed(speed);
  }, []);

  // Handle regeneration prompt change
  const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRegenerationPrompt(event.target.value);
  }, []);

  // Regenerate selected asset
  const handleRegenerateAsset = useCallback(() => {
    if (!selectedAssetName || isRegenerating) return;

    regenerateAsset(selectedAssetName, {
      additionalPrompt: regenerationPrompt,
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
  }, [selectedAssetName, isRegenerating, regenerationPrompt]);

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

          {selectedAsset && (
            <DirectionSelector>
              <SectionTitle>Direction</SectionTitle>
              <DirectionButtons>
                <DirectionButton
                  selected={selectedDirection === 'left'}
                  onClick={() => handleDirectionSelect('left')}
                  disabled={isLoading || isRegenerating}
                >
                  Left
                </DirectionButton>
                <DirectionButton
                  selected={selectedDirection === 'right'}
                  onClick={() => handleDirectionSelect('right')}
                  disabled={isLoading || isRegenerating}
                >
                  Right
                </DirectionButton>
              </DirectionButtons>
            </DirectionSelector>
          )}

          <AnimationControls
            isPlaying={isAnimationPlaying}
            speed={animationSpeed}
            onTogglePlay={handleTogglePlay}
            onSpeedChange={handleSpeedChange}
            disabled={isLoading || isRegenerating}
          />

          <RegenerateSection>
            <SectionTitle>Asset Generation</SectionTitle>
            
            <PromptLabel htmlFor="regeneration-prompt">Special Requirements:</PromptLabel>
            <PromptTextArea 
              id="regeneration-prompt"
              value={regenerationPrompt}
              onChange={handlePromptChange}
              placeholder="Enter any special requirements for regeneration..."
              disabled={isLoading || isRegenerating}
            />
            
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

const PromptLabel = styled.label`
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  margin-top: 0.5rem;
`;

const PromptTextArea = styled.textarea`
  width: 100%;
  min-height: 80px;
  padding: 0.6rem;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 0.5rem;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
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

// New Direction Selector Components
const DirectionSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
`;

const DirectionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const DirectionButton = styled.button<{ selected: boolean }>`
  flex: 1;
  padding: 0.5rem;
  background-color: ${(props) => (props.selected ? 'var(--primary-color)' : 'var(--input-bg-color)')};
  color: ${(props) => (props.selected ? 'white' : 'var(--text-color)')};
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover:not(:disabled) {
    background-color: ${(props) => (props.selected ? 'var(--primary-hover-color, #0056b3)' : 'var(--border-color)')};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;