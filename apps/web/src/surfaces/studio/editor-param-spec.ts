import { valueProblem, type ParamSpec } from '@gamedevpl/contract';

export function isParamSpec(value: unknown): value is ParamSpec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const spec = value as Record<string, unknown>;
  const label = spec.label as { en?: unknown; pl?: unknown } | null | undefined;
  if (!label || typeof label.en !== 'string' || typeof label.pl !== 'string') return false;
  switch (spec.type) {
    case 'text':
      if (!Number.isInteger(spec.max) || (spec.max as number) < 0) return false;
      break;
    case 'int':
    case 'number':
      if (
        typeof spec.min !== 'number' ||
        typeof spec.max !== 'number' ||
        !Number.isFinite(spec.min) ||
        !Number.isFinite(spec.max) ||
        spec.min > spec.max ||
        !Number.isFinite(spec.max - spec.min) ||
        (spec.type === 'int' && (!Number.isInteger(spec.min) || !Number.isInteger(spec.max)))
      )
        return false;
      break;
    case 'enum':
      if (!Array.isArray(spec.values) || spec.values.length === 0 || !spec.values.every((v) => typeof v === 'string'))
        return false;
      break;
    case 'bool':
      break;
    default:
      return false;
  }
  return valueProblem(spec as ParamSpec, spec.default) === null;
}
