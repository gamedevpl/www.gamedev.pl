import type { HistoryVersion } from '@gamedevpl/contract';
import wrapAnsi from 'wrap-ansi';
import { sanitizePath, stripTerminalControls } from './ansi.js';
import { wantsColor } from './renderer.js';

export type HistoryFormat = { columns?: number; color?: boolean; oneline?: boolean };

export function historyTerminalFormat(
  env = process.env,
  output: { columns?: number; isTTY?: boolean } = process.stdout,
  columns = output.columns,
): HistoryFormat {
  return { columns, color: wantsColor(env, Boolean(output.isTTY)) };
}

function field(value: string): string {
  return sanitizePath(value).replace(/\s+/gu, ' ').trim();
}

function width(columns = 80): number {
  // Wide glyphs require two columns.
  return Number.isFinite(columns) ? Math.max(2, Math.min(100, Math.floor(columns))) : 80;
}

function paint(text: string, code: number, color?: boolean): string {
  return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function indented(text: string, columns: number): string {
  const indent = ' '.repeat(Math.min(4, columns - 2));
  return wrapAnsi(text, columns - indent.length, { hard: true })
    .split('\n')
    .map((line) => (line ? indent + line : ''))
    .join('\n');
}

export function formatHistoryVersion(row: HistoryVersion, options: HistoryFormat = {}): string {
  const columns = width(options.columns);
  const version = field(row.version);
  const summary =
    stripTerminalControls(row.summary ?? '')
      .replace(/\t/g, ' ')
      .trim() || '(no change summary)';
  if (options.oneline) {
    const text = `${version} ${summary.replace(/\s+/gu, ' ')}`;
    const line = wrapAnsi(text, columns - 1, { hard: true }).split('\n');
    const clipped = line[0]! + (line.length > 1 ? '…' : '');
    return clipped.replace(version, paint(version, 33, options.color));
  }
  const date = new Date(row.createdAt);
  const readableDate = Number.isNaN(date.getTime()) ? field(row.createdAt) : date.toString().replace(/ \(.*\)$/, '');
  const verdict = field(row.verdict ?? 'unknown');
  const statusColor = verdict === 'passed' ? 32 : verdict === 'pending' || verdict === 'unknown' ? 33 : 31;
  const lines = [
    paint(`version ${version}`, 33, options.color),
    `Date:    ${readableDate}`,
    `Status:  ${field(row.deliveryMode ?? 'publish')} / ${paint(verdict, statusColor, options.color)}`,
  ];
  if (row.backend) lines.push(`Backend: ${field(row.backend)}`);
  if (row.model) lines.push(`Model:   ${field(row.model)}`);
  return `${lines.map((line) => wrapAnsi(line, columns, { hard: true })).join('\n')}\n\n${indented(summary, columns)}`;
}

export function formatHistoryLog(versions: HistoryVersion[], options: HistoryFormat = {}): string {
  return (
    versions.map((row) => formatHistoryVersion(row, options)).join(options.oneline ? '\n' : '\n\n') ||
    'No delivered versions yet.'
  );
}
