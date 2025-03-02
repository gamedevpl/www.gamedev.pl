export interface AssetAnimationState {
  progress: number;
  stance: string;
}

/**
 * Supported property control types
 */
export type PropertyControlType = 'boolean' | 'number' | 'string' | 'enum';

/**
 * Base property control definition
 */
export interface BasePropertyControlDefinition {
  type: PropertyControlType;
  label: string;
  description?: string;
}

/**
 * Boolean property control definition
 */
export interface BooleanPropertyControlDefinition extends BasePropertyControlDefinition {
  type: 'boolean';
}

/**
 * Number property control definition
 */
export interface NumberPropertyControlDefinition extends BasePropertyControlDefinition {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

/**
 * String property control definition
 */
export interface StringPropertyControlDefinition extends BasePropertyControlDefinition {
  type: 'string';
  placeholder?: string;
}

/**
 * Enum property control definition
 */
export interface EnumPropertyControlDefinition extends BasePropertyControlDefinition {
  type: 'enum';
  options: Array<{ value: string; label: string }>;
}

/**
 * Union type of all property control definitions
 */
export type PropertyControlDefinition =
  | BooleanPropertyControlDefinition
  | NumberPropertyControlDefinition
  | StringPropertyControlDefinition
  | EnumPropertyControlDefinition;

/**
 * Asset interface with support for custom properties
 */
export interface Asset<T extends AssetAnimationState = AssetAnimationState, P extends Record<string, any> = Record<string, never>> {
  /** Asset name */
  name: string;

  /** Asset description */
  description: string;

  /** Optional reference image path relative to asset directory */
  referenceImage?: string;

  /** Available animation stances */
  stances: string[];

  /** Default state for the asset (animation state and custom properties) */
  defaultState: T & P;

  /**
   * Get property control definitions for custom properties
   * @returns Map of property names to control definitions
   */
  getPropertyControls(): Record<keyof P, PropertyControlDefinition>;

  /**
   * Render the asset to a canvas context
   * @param ctx Canvas rendering context
   * @param state Animation state and custom properties
   */
  render(ctx: CanvasRenderingContext2D, state?: T & P): void;
}