import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { devConfig, DevConfig, setDevConfig, getDevMode } from './dev-config';

export function DevConfigPanel() {
  // Local state to manage panel configuration
  const [config, setConfig] = useState<DevConfig>(devConfig);
  const [isDevMode, setIsDevMode] = useState(getDevMode);

  // Sync local state with dev config on hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setIsDevMode(getDevMode());
      setConfig(devConfig);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Don't render panel if not in dev mode
  if (!isDevMode) {
    return null;
  }

  const handleToggle = (key: keyof DevConfig) => {
    const newConfig = {
      ...config,
      [key]: !config[key],
    };
    setDevConfig(newConfig);
    setConfig(newConfig);
  };

  const handleNumberChange = (key: keyof DevConfig, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      const newConfig = {
        ...config,
        [key]: numValue,
      };
      setDevConfig(newConfig);
      setConfig(newConfig);
    }
  };

  return (
    <Panel>
      <Title>Dev Configuration</Title>

      <Section>
        <SectionTitle>Debug Options</SectionTitle>
        <ToggleContainer>
          <ToggleInput 
            type="checkbox" 
            checked={config.debugVitals} 
            onChange={() => handleToggle('debugVitals')} 
          />
          Debug vitals
        </ToggleContainer>
        <ToggleContainer>
          <ToggleInput
            type="checkbox"
            checked={config.debugStateMachine}
            onChange={() => handleToggle('debugStateMachine')}
          />
          Debug state
        </ToggleContainer>
      </Section>

      <Section>
        <SectionTitle>Metrics Collection</SectionTitle>
        <ToggleContainer>
          <ToggleInput
            type="checkbox"
            checked={config.metricsEnabled}
            onChange={() => handleToggle('metricsEnabled')}
          />
          Enable metrics collection
        </ToggleContainer>
        <InputContainer>
          <InputLabel>Time window (ms):</InputLabel>
          <NumberInput
            type="number"
            value={config.metricsTimeWindow}
            onChange={(e) => handleNumberChange('metricsTimeWindow', e.target.value)}
            min="1000"
            max="60000"
            step="1000"
            disabled={!config.metricsEnabled}
          />
        </InputContainer>
        <InputContainer>
          <InputLabel>Max payload size:</InputLabel>
          <NumberInput
            type="number"
            value={config.metricsMaxPayloadSize}
            onChange={(e) => handleNumberChange('metricsMaxPayloadSize', e.target.value)}
            min="512"
            max="8192"
            step="512"
            disabled={!config.metricsEnabled}
          />
        </InputContainer>
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

const InputContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const InputLabel = styled.label`
  flex: 1;
  margin-right: 8px;
  color: rgba(255, 255, 255, 0.9);
`;

const NumberInput = styled.input`
  width: 80px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  background: transparent;
  color: white;
  font-size: 12px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
    border-color: #4a9eff;
  }

  &:hover:not(:disabled) {
    border-color: #4a9eff;
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;