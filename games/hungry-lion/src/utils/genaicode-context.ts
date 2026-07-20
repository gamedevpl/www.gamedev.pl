const contextStorage = new Map<string, string>();

export async function updateAppContext(key: string, value: string) {
  contextStorage.set(key, value);
}

export async function getAppContext(key: string) {
  return contextStorage.get(key);
}
