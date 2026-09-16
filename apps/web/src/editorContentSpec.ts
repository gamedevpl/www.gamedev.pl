// Fill omitted spec fields before the L4 validator.
import type {
  CollectionItemSpec,
  CollectionSpec,
  EditorDefinition,
  EditorLayerSpec as ContractLayerSpec,
} from '@gamedevpl/contract';
import type { EditorCollectionSpec, EditorLayerSpec } from './studioApi.js';

export function asLayerSpec(spec: EditorLayerSpec): ContractLayerSpec {
  return {
    ...spec,
    properties: spec.properties ?? {},
    constraints: spec.constraints ?? [],
    ...(spec.widget === 'entities' ? { min: spec.min ?? 0, max: spec.max ?? 64 } : {}),
  } as ContractLayerSpec;
}

export function asItemSpec(spec: EditorCollectionSpec['item']): CollectionItemSpec {
  if (spec.widget === 'layered') {
    return {
      ...spec,
      properties: spec.properties ?? {},
      constraints: spec.constraints ?? [],
      layers: Object.fromEntries(Object.entries(spec.layers ?? {}).map(([key, layer]) => [key, asLayerSpec(layer)])),
    } as CollectionItemSpec;
  }
  if (spec.widget === 'path') return { ...spec, properties: spec.properties ?? {} } as CollectionItemSpec;
  return { ...spec, properties: spec.properties ?? {}, constraints: spec.constraints ?? [] } as CollectionItemSpec;
}

export function asCollectionSpec(spec: EditorCollectionSpec): CollectionSpec {
  return {
    ...spec,
    min: spec.min ?? 0,
    max: spec.max ?? 32,
    item: asItemSpec(spec.item),
    defaults: spec.defaults ?? [],
  } as CollectionSpec;
}

export function asDefinition(definition: EditorDefinition): EditorDefinition {
  return {
    ...definition,
    content: Object.fromEntries(
      Object.entries(definition.content).map(([key, spec]) => [key, asCollectionSpec(spec as EditorCollectionSpec)]),
    ),
    ...(definition.layers
      ? {
          layers: Object.fromEntries(
            Object.entries(definition.layers).map(([key, spec]) => [key, asLayerSpec(spec as EditorLayerSpec)]),
          ),
        }
      : {}),
  };
}
