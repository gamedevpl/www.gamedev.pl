# Kit runtime verification

`apps/api/scripts/verify-kit-browser.ts` verifies an installed Creator Kit with a
specific API consumer revision. It installs a SHA-256-checked archive with npm
lifecycle scripts disabled and boots ordinary and hot games through both
assemblers in the game iframe sandbox.

The SDK reads the installed package. The API reads committed engine sources
staged by the publisher from Git at the candidate engine ref. Both use the same
probe game sources. Browser startup, initial keyboard input and advancing frames
must complete without JavaScript errors. The JSON result records the engine ref,
archive digest, API revision and four HTML digests.

The consumer checkout must match the requested source revision and have no
tracked modifications. The installed Kit and staged engine data must identify
the candidate engine ref. Staged source reads reject paths and symlinks escaping
their roots. A failed installation or check produces no success receipt.

```bash
E2E_CHROMIUM_PATH=/path/to/chromium node --import tsx \
  apps/api/scripts/verify-kit-browser.ts \
  --tarball /path/to/kit.tgz --tarball-sha256 FULL_SHA256 \
  --engine-ref ENGINE_COMMIT --engine-source-root /path/to/staged-engine \
  --consumer-sha API_COMMIT --output /path/to/result.json
```

The staged engine directory contains `shared/` exported from that commit and an
`engine-ref.txt` naming it. The native publisher prepares these inputs, selects
the deployed consumer through `/api/health.buildSha`, and requires matching
evidence before upload and registry promotion. It rechecks the consumer identity
immediately before moving the registry pointer.

`buildSha` comes from `build-sha.txt` embedded in the production image with the
`PLATFORM_SOURCE_SHA` Docker argument. Deployment supplies the reviewed commit;
CI boots the production image and checks that identity. Local development or
images without identity report `null`, which cannot authorize Kit promotion.
The hand-run deployment path requires committed sources too.

This command complements the [snapshot artifact gate](./games-snapshot.md#the-publish-path).
It verifies startup and initial input, while game-specific scenarios and replay
checks cover longer gameplay. It does not publish artifacts or change pointers.
