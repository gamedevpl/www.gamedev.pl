import { useMemo } from 'react';
import { encode } from 'uqr';

type QrCodeProps = { value: string; size?: number; label: string };

/**
 * Renders a QR as one inline SVG path — no images, no canvas, no network. The
 * quiet zone matters: scanners need the white margin, so it is drawn as part of
 * the light background rather than left to CSS.
 */
export function QrCode({ value, size = 260, label }: QrCodeProps) {
  const { path, dimension } = useMemo(() => {
    const result = encode(value, { ecc: 'M' });
    const quietZone = 2;
    const total = result.size + quietZone * 2;
    const segments: string[] = [];
    for (let row = 0; row < result.size; row += 1) {
      for (let column = 0; column < result.size; column += 1) {
        if (result.data[row][column]) {
          segments.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
        }
      }
    }
    return { path: segments.join(''), dimension: total };
  }, [value]);

  return (
    <svg
      className="party-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={path} fill="#0b1020" />
    </svg>
  );
}
