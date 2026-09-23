import { describe, expect, it } from 'vitest';
import { buildAppLinksConfig } from './generate-app-links.mjs';

describe('generate-app-links', () => {
  it('falls back to inert, non-matching placeholders when nothing is configured', () => {
    const { appleAppSiteAssociation, assetlinks, isPlaceholder } = buildAppLinksConfig({});

    expect(isPlaceholder).toBe(true);
    expect(appleAppSiteAssociation.applinks.details[0].appID).toContain('PLACEHOLDER');
    expect(assetlinks[0].target.package_name).toContain('placeholder');
    expect(assetlinks[0].target.sha256_cert_fingerprints[0]).toMatch(/^(00:)+00$/);
  });

  it('carries the join and status/studio paths every build needs', () => {
    const { appleAppSiteAssociation } = buildAppLinksConfig({});
    expect(appleAppSiteAssociation.applinks.details[0].paths).toEqual(['/join/*', '/status/*', '/studio/*']);
  });

  it('builds real config once every id is set', () => {
    const env = {
      IOS_TEAM_ID: 'ABCDE12345',
      IOS_BUNDLE_ID: 'pl.gamedev.app',
      ANDROID_PACKAGE_NAME: 'pl.gamedev.app',
      ANDROID_SHA256_CERT_FINGERPRINTS: 'AA:BB:CC, DD:EE:FF',
    };
    const { appleAppSiteAssociation, assetlinks, isPlaceholder } = buildAppLinksConfig(env);

    expect(isPlaceholder).toBe(false);
    expect(appleAppSiteAssociation.applinks.details[0].appID).toBe('ABCDE12345.pl.gamedev.app');
    expect(assetlinks[0].target.package_name).toBe('pl.gamedev.app');
    expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual(['AA:BB:CC', 'DD:EE:FF']);
  });

  it('is still a placeholder if only some ids are set', () => {
    const { isPlaceholder } = buildAppLinksConfig({ IOS_TEAM_ID: 'ABCDE12345' });
    expect(isPlaceholder).toBe(true);
  });
});
