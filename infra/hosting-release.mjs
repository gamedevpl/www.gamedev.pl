import { setTimeout as delay } from 'node:timers/promises';
import {
  METADATA_PATH,
  parseLedger,
  planAssets,
  readAssets,
  servingConfig,
  validateAssetPath,
  sha256,
} from './hosting-retention.mjs';

const API = 'https://firebasehosting.googleapis.com/v1beta1';

export async function releaseAssets({
  site,
  project,
  token,
  assetDir,
  hosting,
  dryRun = false,
  confirmVersion,
  now = Date.now(),
  fetchImpl = fetch,
  wait = delay,
}) {
  if (!/^[a-z0-9-]+$/.test(site) || !/^[a-z0-9-]+$/.test(project) || !token)
    throw new Error('Missing Hosting identity');
  const origin = `https://${site}.web.app`;
  const auth = { Authorization: `Bearer ${token}`, 'x-goog-user-project': project };
  const config = servingConfig(hosting);
  const current = await readAssets(assetDir);

  function validateVersion(name) {
    if (
      !name?.startsWith(`sites/${site}/versions/`) ||
      name.split('/').length !== 4 ||
      !/^[a-zA-Z0-9_-]+$/.test(name.split('/').at(-1))
    ) {
      throw new Error('Invalid Hosting version name');
    }
    return name;
  }

  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new Error(
        `Hosting request failed: ${options.method ?? 'GET'} ${new URL(url).pathname}: ${response.status}`,
      );
    return response;
  }

  async function api(resource, method = 'GET', body) {
    const response = await request(`${API}/${resource}`, {
      method,
      headers: { ...auth, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.json();
  }

  async function liveVersion() {
    const result = await api(`sites/${site}/releases?pageSize=1`);
    const release = result.releases?.[0];
    if (!release) throw new Error('No live release: bootstrap Hosting before enabling retention');
    if (release.type === 'SITE_DISABLE' || release.version?.status !== 'FINALIZED')
      throw new Error('Live Hosting release is not finalized');
    return validateVersion(release.version.name);
  }

  async function versionFiles(version) {
    const files = new Map();
    const seen = new Set();
    let next = '';
    do {
      if (seen.has(next)) throw new Error('Repeated Hosting pagination token');
      seen.add(next);
      const result = await api(`${version}/files?status=ACTIVE&pageSize=1000&pageToken=${encodeURIComponent(next)}`);
      for (const file of result.files ?? []) {
        if (!file.path?.startsWith('/assets/')) continue;
        validateAssetPath(file.path);
        if (file.status !== 'ACTIVE' || !/^[a-f0-9]{64}$/.test(file.hash) || files.has(file.path))
          throw new Error('Invalid Hosting file listing');
        files.set(file.path, file.hash);
      }
      next = result.nextPageToken ?? '';
    } while (next);
    if (!files.size) throw new Error('Live asset listing is empty');
    return files;
  }

  const previousVersion = await liveVersion();
  if (confirmVersion && confirmVersion !== previousVersion)
    throw new Error('Promotion confirmation targets a different Hosting version');
  const liveFiles = await versionFiles(previousVersion);
  const metadataNames = [...liveFiles.keys()].filter((name) => METADATA_PATH.test(name));
  if (metadataNames.length > 1) throw new Error('Multiple retention ledgers in the live version');
  let previous;
  if (metadataNames.length) {
    const raw = Buffer.from(await (await request(origin + metadataNames[0])).arrayBuffer());
    previous = parseLedger(raw, metadataNames[0], liveFiles);
  } else {
    // Bootstrap preserves the currently served build before its first replacement.
    previous = new Map([...liveFiles].map(([name, hash]) => [name, { hash, expiresAt: null }]));
  }
  for (const [name, file] of current) {
    const oldHash = previous.get(name)?.hash;
    if (oldHash && oldHash !== file.hash) {
      // Compressor upgrades can change gzip bytes without changing the asset itself.
      const oldRaw = Buffer.from(await (await request(origin + name)).arrayBuffer());
      if (!oldRaw.equals(file.raw)) throw new Error(`Immutable asset collision: ${name}`);
      file.hash = oldHash;
      // Existing Hosting blobs must be reused when their encoding differs.
      file.compressed = undefined;
    }
  }
  const plan = planAssets(current, previous, now, Boolean(confirmVersion));
  const receipt = { previousVersion, retained: plan.retained.length, files: plan.manifest.size, dryRun };
  if (dryRun) return receipt;

  const probes = new Map([[plan.metadataPath, plan.metadataPath.slice('/assets/retention-'.length, -5)]]);
  for (const paths of [[...current.keys()], plan.retained]) {
    for (const pattern of [/\/index-.*\.js$/, /\/App-.*\.js$/, /\/en-.*\.js$/, /\/pl-.*\.js$/, /\.css$/, /\.js$/]) {
      const name = paths.find((candidate) => pattern.test(candidate));
      if (!name || probes.has(name)) continue;
      const raw = current.get(name)?.raw ?? Buffer.from(await (await request(origin + name)).arrayBuffer());
      probes.set(name, sha256(raw));
    }
  }

  const version = validateVersion((await api(`sites/${site}/versions`, 'POST', { config })).name);
  const entries = [...plan.manifest];
  for (let start = 0; start < entries.length; start += 1000) {
    const populated = await api(`${version}:populateFiles`, 'POST', {
      files: Object.fromEntries(entries.slice(start, start + 1000)),
    });
    const required = populated.uploadRequiredHashes ?? [];
    if (required.length) {
      const expectedUrl = `https://upload-firebasehosting.googleapis.com/upload/${version}/files`;
      if (populated.uploadUrl !== expectedUrl) throw new Error('Unexpected Hosting upload destination');
      for (const hash of required) {
        if (!plan.uploads.get(hash))
          throw new Error('Hosting lost a retained blob; refusing to publish an incomplete version');
      }
      for (let offset = 0; offset < required.length; offset += 8) {
        await Promise.all(
          required.slice(offset, offset + 8).map((hash) =>
            request(`${expectedUrl}/${hash}`, {
              method: 'POST',
              headers: { ...auth, 'content-type': 'application/octet-stream' },
              body: plan.uploads.get(hash),
            }),
          ),
        );
      }
    }
  }
  const finalized = await api(`${version}?updateMask=status`, 'PATCH', { status: 'FINALIZED' });
  if (finalized.status !== 'FINALIZED') throw new Error('Hosting version did not finalize');
  const publishedFiles = await versionFiles(version);
  if (publishedFiles.size !== plan.manifest.size || entries.some(([name, hash]) => publishedFiles.get(name) !== hash)) {
    throw new Error('Finalized Hosting version does not contain the complete asset manifest');
  }
  if ((await liveVersion()) !== previousVersion) throw new Error('Live Hosting release changed during upload');
  await api(`sites/${site}/releases?versionName=${encodeURIComponent(version)}`, 'POST', {});

  // Verify representative assets before promoting Cloud Run.
  for (const [name, expectedHash] of probes) {
    let verified = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await request(`${origin}${name}?release=${encodeURIComponent(version)}`, { cache: 'reload' });
        const raw = Buffer.from(await response.arrayBuffer());
        if (sha256(raw) === expectedHash) {
          verified = true;
          break;
        }
      } catch {
        // CDN propagation can briefly lag the release API.
      }
      if (attempt < 4) await wait(1000 * 2 ** attempt);
    }
    if (!verified) throw new Error(`Released asset verification failed: ${name}`);
  }
  if ((await liveVersion()) !== version) throw new Error('Live Hosting release changed during verification');
  return { ...receipt, version, probes: probes.size };
}
