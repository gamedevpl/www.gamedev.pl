// Generates the two universal-link / app-link association files (App Store
// guideline 4.7.4): `apple-app-site-association` and `assetlinks.json`.
//
// The native app's Apple Team ID, iOS bundle ID, Android package name and Android
// signing-cert fingerprints are not decided yet. Rather than hardcode a guess that
// would silently fail Apple/Google's domain verification later, this script reads
// them from environment variables and falls back to obvious, non-matching
// placeholders when they are unset — the files always exist and are always valid
// JSON, but a placeholder entry can never verify against a real app.
//
// Set these before shipping the native app:
//   IOS_TEAM_ID                       Apple Developer Team ID (10 chars)
//   IOS_BUNDLE_ID                     iOS app bundle identifier
//   ANDROID_PACKAGE_NAME              Android application ID
//   ANDROID_SHA256_CERT_FINGERPRINTS  Comma-separated SHA-256 signing fingerprints
//
// Run standalone: node scripts/generate-app-links.mjs [outDir]
// outDir defaults to public/.well-known (dev / the checked-in placeholder);
// the build script also runs this into dist/.well-known with live deploy env.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PLACEHOLDER_TEAM_ID = 'PLACEHOLDERTEAMID';
const PLACEHOLDER_BUNDLE_ID = 'pl.gamedev.app.placeholder';
const PLACEHOLDER_PACKAGE_NAME = 'pl.gamedev.app.placeholder';
const PLACEHOLDER_FINGERPRINT =
  '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00';

// The two link shapes App Store 4.7.4 requires today: joining a party room and a
// game's status/studio page. Kept in step with apps/web/src/core/router.ts.
const APP_LINK_PATHS = ['/join/*', '/status/*', '/studio/*'];

function readList(env, name, fallback) {
  const raw = env[name]?.trim();
  if (!raw) return { value: [fallback], isPlaceholder: true };
  return { value: raw.split(',').map((entry) => entry.trim()).filter(Boolean), isPlaceholder: false };
}

function readValue(env, name, fallback) {
  const raw = env[name]?.trim();
  return raw ? { value: raw, isPlaceholder: false } : { value: fallback, isPlaceholder: true };
}

export function buildAppLinksConfig(env = process.env) {
  const teamId = readValue(env, 'IOS_TEAM_ID', PLACEHOLDER_TEAM_ID);
  const iosBundleId = readValue(env, 'IOS_BUNDLE_ID', PLACEHOLDER_BUNDLE_ID);
  const androidPackage = readValue(env, 'ANDROID_PACKAGE_NAME', PLACEHOLDER_PACKAGE_NAME);
  const androidFingerprints = readList(env, 'ANDROID_SHA256_CERT_FINGERPRINTS', PLACEHOLDER_FINGERPRINT);

  const isPlaceholder =
    teamId.isPlaceholder || iosBundleId.isPlaceholder || androidPackage.isPlaceholder || androidFingerprints.isPlaceholder;

  const appleAppSiteAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId.value}.${iosBundleId.value}`,
          paths: APP_LINK_PATHS,
        },
      ],
    },
  };

  const assetlinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: androidPackage.value,
        sha256_cert_fingerprints: androidFingerprints.value,
      },
    },
  ];

  return { appleAppSiteAssociation, assetlinks, isPlaceholder };
}

function main() {
  const outDir = process.argv[2] ?? path.join(process.cwd(), 'public', '.well-known');
  mkdirSync(outDir, { recursive: true });

  const { appleAppSiteAssociation, assetlinks, isPlaceholder } = buildAppLinksConfig();

  writeFileSync(
    path.join(outDir, 'apple-app-site-association'),
    `${JSON.stringify(appleAppSiteAssociation, null, 2)}\n`,
  );
  writeFileSync(path.join(outDir, 'assetlinks.json'), `${JSON.stringify(assetlinks, null, 2)}\n`);

  if (isPlaceholder) {
    console.warn(
      'generate-app-links: wrote INERT placeholders — set IOS_TEAM_ID, IOS_BUNDLE_ID, ' +
        'ANDROID_PACKAGE_NAME and ANDROID_SHA256_CERT_FINGERPRINTS before the native app ships.',
    );
  } else {
    console.log(`generate-app-links: wrote app-links config into ${outDir}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
