import {
  LAYERS_KEY,
  PARAMS_KEY,
  isPlainObject,
  type EditorDefinition,
  type EditorLayerSpec,
  type PropertySpec,
} from '@gamedevpl/contract';

export function textFields(definition: EditorDefinition, content: Record<string, unknown>): string[] {
  const texts: string[] = [];
  function properties(specs: Record<string, PropertySpec>, values: unknown) {
    if (!isPlainObject(values)) return;
    for (const [name, spec] of Object.entries(specs)) {
      const value = values[name];
      if (spec.type === 'text' && typeof value === 'string' && value.trim()) texts.push(value);
    }
  }
  function layers(specs: Record<string, EditorLayerSpec>, values: unknown) {
    if (!isPlainObject(values)) return;
    for (const [key, spec] of Object.entries(specs)) {
      const raw = values[key];
      const items = spec.widget === 'entities' && Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (isPlainObject(item)) properties(spec.properties, item.properties);
      }
    }
  }
  if (definition.params) properties(definition.params, content[PARAMS_KEY]);
  for (const [key, spec] of Object.entries(definition.content)) {
    const items = content[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isPlainObject(item)) continue;
      properties(spec.item.properties, item.properties);
      if (spec.item.widget === 'layered') layers(spec.item.layers, item.layers);
    }
  }
  if (definition.layers) layers(definition.layers, content[LAYERS_KEY]);
  return texts;
}
