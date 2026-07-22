# Deployment

> **Status: 📋 Not selected or built.** `infra/` is intentionally non-deployable until the
> games repository defines its catalog and bundle publishing contract.

## What production needs

The games-repo pivot removes agent compute, job queues, auth proxies, and agent-runner images
from the deployment. The expected components are:

| Component            | Responsibility                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Web app              | Static catalog and player UI                                                             |
| Games origin         | Published `catalog.json` and self-contained game bundles on a separate cookieless origin |
| Submission API       | Validate/rate-limit specs and create narrowly scoped repository issues                   |
| Repository workflows | Validate agent PRs and publish merged games                                              |

Browsing and playing should not require the submission API. GitHub Pages is the simplest first
games origin; a bucket/CDN is the scaling option. The choice remains open.

## Required security properties

- Separate app and games origins; the games origin has no app cookies or privileged endpoints.
- Restrictive CSP for game documents, especially `connect-src`, navigation, framing, and
  external assets.
- Repository credentials remain server-side and have only the permissions the submission flow
  needs.
- Untrusted PR validation receives no deployment credentials.
- Deployments use GitHub OIDC/workload identity rather than long-lived cloud keys.
- Third-party actions are pinned to commit SHAs and workflows declare least-privilege
  `permissions:`.
- Production publishing runs only from a protected branch/environment with rollback support.

## Current CI

`.github/workflows/ci.yml` installs dependencies and runs lint, type-check, tests, and build on
pushes and pull requests. It is a development gate, not a deployment workflow. No production
deploy workflow currently exists.

The dedicated games repository will need two additional workflows:

1. Validate changed games on every PR without secrets.
2. Publish catalog and bundles after a reviewed merge to its protected default branch.

## Infrastructure as code

The previous Terraform described deleted container-generation services and was intentionally
retired. New infrastructure must be written only after these decisions are recorded:

- games-repo location and output contract;
- GitHub Pages versus bucket/CDN;
- hosting platform for the web app and submission API;
- identity, moderation, and expected submission volume;
- custom domains, retention, rollback, and takedown operations.

Until then, `infra/` is a documented placeholder and `terraform apply` must create nothing.

## Suggested sequence

1. Create the games repository and its validation/publish contract.
2. Publish seed games to a separate origin.
3. Connect the catalog/player without adding backend state.
4. Design submission identity, rights, moderation, and abuse controls.
5. Add the minimal submission API.
6. Select hosting and implement narrowly scoped infrastructure and deployment workflows.
