export function permissionBlocked(line: string): boolean {
  if (
    line.includes('no output produced') &&
    line.includes('headless mode cannot prompt') &&
    line.includes('auto-denied')
  )
    return true;
  return false;
}
