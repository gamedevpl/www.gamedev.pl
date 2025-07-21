export function unpackStatus<T>(result: [T, string] | T): [T, string] {
  if (Array.isArray(result)) {
    return result;
  }
  return [result, ''];
}
