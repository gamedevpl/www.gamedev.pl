#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */
const pleaseUpgradeNode = require('please-upgrade-node');

const pkg = require('../package.json');
pleaseUpgradeNode(pkg);

const devMode = require('fs').existsSync(`${__dirname}/../src`);
const forceDist = process.argv.indexOf('--force-dist') >= 0;

if (devMode && !forceDist) {
  pleaseUpgradeNode({
    name: 'asset-gen-dev.js',
    engines: {
      node: '>=20',
    },
  });

  import('./asset-gen-dev.js').catch((e) => console.error(e));
} else {
  import('../dist/runner.js').then(({ assetGenRunner }) => assetGenRunner());
}
