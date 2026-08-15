export function editorKitV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.EDITORKIT_V2?.trim().toLowerCase();
  return value === 'true' || value === '1';
}
