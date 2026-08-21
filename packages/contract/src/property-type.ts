// An EditorKit property's declared kind — API and web both derive this.
export const PROPERTY_TYPES = ['text', 'int', 'number', 'enum', 'bool'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
