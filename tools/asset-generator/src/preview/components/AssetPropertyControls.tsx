/**
 * AssetPropertyControls Component
 *
 * A component that renders controls for custom asset properties.
 * Dynamically creates appropriate input controls based on property types.
 */

import styled from 'styled-components';
import {
  Asset,
  PropertyControlDefinition,
  BooleanPropertyControlDefinition,
  NumberPropertyControlDefinition,
  StringPropertyControlDefinition,
  EnumPropertyControlDefinition,
} from '../../assets/assets-types';

interface AssetPropertyControlsProps<P extends Record<string, any>> {
  /** The current asset */
  asset: Asset<any, P> | null;
  /** Current property values */
  propertyValues: Partial<P>;
  /** Callback function called when a property value changes */
  onPropertyChange: (propertyName: keyof P, value: any) => void;
  /** Optional CSS class name */
  className?: string;
  /** Whether the controls are disabled */
  disabled?: boolean;
}

/**
 * AssetPropertyControls Component
 */
function AssetPropertyControls<P extends Record<string, any>>({
  asset,
  propertyValues,
  onPropertyChange,
  className,
  disabled = false,
}: AssetPropertyControlsProps<P>): JSX.Element {
  // If no asset is selected, or the asset doesn't have property controls, render nothing
  if (!asset) {
    return <></>;
  }

  // Get property control definitions from the asset
  let propertyControls: Record<string, PropertyControlDefinition>;
  try {
    propertyControls = asset.getPropertyControls();
  } catch (error) {
    console.error('Error getting property controls:', error);
    return <ErrorMessage>Error loading property controls</ErrorMessage>;
  }

  // If there are no property controls, render a message
  if (!propertyControls || Object.keys(propertyControls).length === 0) {
    return <NoPropertiesMessage>No customizable properties available</NoPropertiesMessage>;
  }

  // Render the property controls
  return (
    <Container className={className}>
      <SectionTitle>Asset Properties</SectionTitle>
      <ControlsList>
        {Object.entries(propertyControls).map(([propertyName, controlDef]) => (
          <ControlItem key={propertyName}>
            {renderPropertyControl(
              propertyName as keyof P,
              controlDef,
              propertyValues[propertyName as keyof P],
              onPropertyChange,
              disabled,
            )}
          </ControlItem>
        ))}
      </ControlsList>
    </Container>
  );
}

/**
 * Renders an appropriate control based on the property type
 */
function renderPropertyControl<P extends Record<string, any>>(
  propertyName: keyof P,
  controlDef: PropertyControlDefinition,
  value: any,
  onChange: (propertyName: keyof P, value: any) => void,
  disabled: boolean,
): JSX.Element {
  const handleChange = (newValue: any) => {
    onChange(propertyName, newValue);
  };

  switch (controlDef.type) {
    case 'boolean':
      return renderBooleanControl(
        propertyName.toString(),
        controlDef as BooleanPropertyControlDefinition,
        !!value,
        handleChange,
        disabled,
      );
    case 'number':
      return renderNumberControl(
        propertyName.toString(),
        controlDef as NumberPropertyControlDefinition,
        typeof value === 'number' ? value : 0,
        handleChange,
        disabled,
      );
    case 'string':
      return renderStringControl(
        propertyName.toString(),
        controlDef as StringPropertyControlDefinition,
        value?.toString() || '',
        handleChange,
        disabled,
      );
    case 'enum':
      return renderEnumControl(
        propertyName.toString(),
        controlDef as EnumPropertyControlDefinition,
        value?.toString() || '',
        handleChange,
        disabled,
      );
    default:
      return <div>Unsupported control type: {(controlDef as any).type}</div>;
  }
}

/**
 * Renders a boolean control (checkbox)
 */
function renderBooleanControl(
  id: string,
  controlDef: BooleanPropertyControlDefinition,
  value: boolean,
  onChange: (value: boolean) => void,
  disabled: boolean,
): JSX.Element {
  return (
    <CheckboxContainer>
      <CheckboxLabel htmlFor={`property-${id}`}>
        <Checkbox
          id={`property-${id}`}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span>{controlDef.label}</span>
      </CheckboxLabel>
      {controlDef.description && <ControlDescription>{controlDef.description}</ControlDescription>}
    </CheckboxContainer>
  );
}

/**
 * Renders a number control (number input)
 */
function renderNumberControl(
  id: string,
  controlDef: NumberPropertyControlDefinition,
  value: number,
  onChange: (value: number) => void,
  disabled: boolean,
): JSX.Element {
  return (
    <ControlContainer>
      <Label htmlFor={`property-${id}`}>{controlDef.label}</Label>
      <NumberInput
        id={`property-${id}`}
        type="number"
        value={value}
        min={controlDef.min}
        max={controlDef.max}
        step={controlDef.step || 1}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
      />
      {controlDef.description && <ControlDescription>{controlDef.description}</ControlDescription>}
    </ControlContainer>
  );
}

/**
 * Renders a string control (text input)
 */
function renderStringControl(
  id: string,
  controlDef: StringPropertyControlDefinition,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
): JSX.Element {
  return (
    <ControlContainer>
      <Label htmlFor={`property-${id}`}>{controlDef.label}</Label>
      <TextInput
        id={`property-${id}`}
        type="text"
        value={value}
        placeholder={controlDef.placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {controlDef.description && <ControlDescription>{controlDef.description}</ControlDescription>}
    </ControlContainer>
  );
}

/**
 * Renders an enum control (select dropdown)
 */
function renderEnumControl(
  id: string,
  controlDef: EnumPropertyControlDefinition,
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
): JSX.Element {
  return (
    <ControlContainer>
      <Label htmlFor={`property-${id}`}>{controlDef.label}</Label>
      <Select id={`property-${id}`} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {controlDef.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {controlDef.description && <ControlDescription>{controlDef.description}</ControlDescription>}
    </ControlContainer>
  );
}

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
`;

const SectionTitle = styled.h3`
  font-size: 1rem;
  margin: 0;
  color: var(--text-color);
`;

const ControlsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

const ControlItem = styled.div`
  margin-bottom: 0.5rem;
`;

const ControlContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const Label = styled.label`
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.9rem;
`;

const TextInput = styled.input`
  padding: 0.6rem;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
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
`;

const NumberInput = styled(TextInput)`
  width: 100%;
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

const CheckboxContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-color);
  font-size: 0.9rem;

  &:hover {
    color: var(--primary-color);
  }
`;

const Checkbox = styled.input`
  cursor: pointer;
  width: 1rem;
  height: 1rem;

  &:disabled {
    cursor: not-allowed;
  }
`;

const ControlDescription = styled.div`
  font-size: 0.8rem;
  color: var(--text-secondary-color, #666);
  margin-top: 0.2rem;
`;

const ErrorMessage = styled.div`
  color: var(--error-color, red);
  padding: 1rem;
  background-color: var(--error-bg-color, #ffeeee);
  border-radius: var(--border-radius);
  border: 1px solid var(--error-border-color, #ffcccc);
  margin: 0.5rem 0;
`;

const NoPropertiesMessage = styled.div`
  color: var(--text-secondary-color, #666);
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  font-style: italic;
  text-align: center;
`;

export default AssetPropertyControls;
