import type { IntegrationEvidence } from './plugin-adapters.js';

export type PluginReportRow = {
  target: string;
  status: string;
  changed?: boolean;
  installedVersion?: string;
  availableVersion?: string;
  updateAvailable?: boolean;
  skipped?: string;
  error?: string;
  dryRun?: boolean;
  detectedIntegrations?: IntegrationEvidence[];
};

export function formatPluginRow(row: PluginReportRow, action = 'status'): string {
  const command = (verb: string) => `gamedevpl plugins ${verb} ${row.target}`;
  const version = row.installedVersion ? ` (${row.installedVersion})` : '';
  const state =
    row.skipped && ['modified', 'pending', 'disabled', 'removed'].includes(row.skipped) ? row.skipped : row.status;
  const lines: string[] = [];
  if (row.error && !row.skipped) {
    lines.push(`update failed — ${row.error}`, `Check: ${command('status')}; retry: ${command('update')}.`);
  } else if (state === 'external') {
    const evidence = row.detectedIntegrations ?? [];
    lines.push(
      evidence.some((entry) => entry.kind === 'plugin')
        ? 'existing plugin files or registration detected; managed outside this CLI.'
        : evidence.some((entry) => entry.kind === 'mcp')
          ? 'MCP configuration detected; plugin installation is not confirmed.'
          : 'existing integration detected; plugin installation is not confirmed.',
    );
    for (const entry of evidence)
      lines.push(`Found ${entry.kind === 'mcp' ? 'MCP configuration' : 'plugin'}: ${entry.path}`);
    if (action !== 'status')
      lines.push(
        `Nothing ${action === 'uninstall' ? 'uninstalled' : action === 'install' ? 'installed' : 'updated'}; existing integration preserved.`,
      );
    lines.push('If it works, no additional installation is needed.');
    if (action === 'update') lines.push(`Check the connection in ${row.target}; details: ${command('status')}.`);
    else
      lines.push(
        `Check Gamedev.pl in ${row.target}'s plugin/MCP settings; connection and authentication have not been tested.`,
        `To switch to the CLI-managed plugin, remove the existing integration in that client first, then run ${command('install')}.`,
      );
  } else if (state === 'absent') {
    lines.push(
      action === 'uninstall'
        ? row.changed
          ? 'plugin uninstalled.'
          : 'no plugin detected; nothing to uninstall.'
        : 'no plugin or MCP configuration detected.',
    );
    if (action !== 'uninstall') lines.push(`Optional — only if you use this client: ${command('install')}.`);
  } else if (state === 'installed') {
    const outcome =
      action === 'install'
        ? row.changed
          ? 'plugin installed'
          : 'plugin already installed'
        : action === 'update' && row.changed
          ? 'plugin updated'
          : 'plugin installed';
    lines.push(`${outcome}${version}; managed by gamedevpl.`);
    if (action === 'install' && row.changed === false) lines.push('No changes made.');
    if (action === 'update' && row.changed) lines.push(`Restart ${row.target} to load the updated plugin.`);
    lines.push(
      row.updateAvailable
        ? `Update available${row.availableVersion ? ` (${row.availableVersion})` : ''}: ${command('update')}.`
        : 'Matches this CLI release or is newer; no package update needed.',
    );
  } else if (state === 'pending') {
    lines.push(
      'installation or removal is incomplete; needs cleanup before reinstalling.',
      `Finish cleanup: ${command('uninstall')}; then reinstall if wanted: ${command('install')}.`,
    );
  } else if (state === 'modified') {
    lines.push(
      'plugin files were changed outside this CLI; preserved for review.',
      `Review and back up your changes before managing the plugin in ${row.target}. Check: ${command('status')}.`,
    );
  } else if (state === 'disabled') {
    lines.push(
      'plugin is disabled in the client; left unchanged.',
      `Enable it in ${row.target} if wanted, then run ${command('update')}.`,
    );
  } else if (state === 'removed') {
    lines.push(
      'plugin files remain, but the client no longer lists it as installed; left unchanged.',
      `To restore it: ${command('uninstall')}, then ${command('install')}.`,
    );
  } else if (state === 'configured') {
    lines.push(row.changed === false ? 'creator key already configured; nothing changed.' : 'creator key configured.');
  } else {
    lines.push(`installation state could not be confirmed. Check: ${command('status')}.`);
  }
  if (row.dryRun) lines.unshift('Dry run — no changes made.');
  return `${row.target}: ${lines.join('\n  ')}`;
}
