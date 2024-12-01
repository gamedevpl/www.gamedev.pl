import 'react';
import styled from 'styled-components';
import { useDevConfig, useDevMode } from './dev-config';

export function DevConfigPanel() {
  const isDevMode = useDevMode();
  const [config, updateConfig] = useDevConfig();

  if (!isDevMode) {
    return null;
  }

  const handleToggle = (key: keyof typeof config) => {
    updateConfig({ [key]: !config[key] });
  };

  return (
    <Panel>
      <Title>Dev Configuration</Title>

      <Section>
        <SectionTitle>Game Features</SectionTitle>
        <ToggleContainer>
          <ToggleInput
            type="checkbox"
            checked={config.enableAISantas}
            onChange={() => handleToggle('enableAISantas')}
          />
          AI Santas
        </ToggleContainer>
      </Section>

      <Section>
        <SectionTitle>Rendering</SectionTitle>
        <ToggleContainer>
          <ToggleInput type="checkbox" checked={config.renderSnow} onChange={() => handleToggle('renderSnow')} />
          Snow Effects
        </ToggleContainer>
        <ToggleContainer>
          <ToggleInput type="checkbox" checked={config.renderFire} onChange={() => handleToggle('renderFire')} />
          Fire Effects
        </ToggleContainer>
        <ToggleContainer>
          <ToggleInput type="checkbox" checked={config.renderTrees} onChange={() => handleToggle('renderTrees')} />
          Trees
        </ToggleContainer>
        <ToggleContainer>
          <ToggleInput
            type="checkbox"
            checked={config.renderMountains}
            onChange={() => handleToggle('renderMountains')}
          />
          Mountains
        </ToggleContainer>
        <ToggleContainer>
          <ToggleInput
            type="checkbox"
            checked={config.renderSnowGround}
            onChange={() => handleToggle('renderSnowGround')}
          />
          Snow Ground
        </ToggleContainer>
      </Section>
    </Panel>
  );
}

const Panel = styled.div`
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 8px;
  min-width: 200px;
  z-index: 1000;
  font-family: 'Arial', sans-serif;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Title = styled.h3`
  margin: 0 0 15px 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 8px;
`;

const Section = styled.div`
  margin-bottom: 15px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h4`
  margin: 0 0 8px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: normal;
`;

const ToggleContainer = styled.label`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 12px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    color: #4a9eff;
  }
`;

const ToggleInput = styled.input`
  margin-right: 8px;
  cursor: pointer;

  /* Custom checkbox styling */
  appearance: none;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  background: transparent;
  position: relative;

  &:checked {
    background: #4a9eff;
    border-color: #4a9eff;
  }

  &:checked::after {
    content: '✓';
    position: absolute;
    color: white;
    font-size: 12px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  &:hover {
    border-color: #4a9eff;
  }
`;
