/** How far to translate a right-anchored panel so it stays inside the viewport. */
export function notificationPanelShiftX(
  rect: { left: number; right: number },
  viewportWidth: number,
  margin = 12,
): number {
  const leftOverflow = margin - rect.left;
  const rightOverflow = rect.right - (viewportWidth - margin);
  if (leftOverflow > 0) return leftOverflow;
  if (rightOverflow > 0) return -rightOverflow;
  return 0;
}
