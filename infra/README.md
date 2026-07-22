# Infrastructure placeholder

There is no deployable infrastructure yet. The previous Terraform targeted the retired
self-hosted agent runner and has been removed from the active configuration.

`terraform init` and `terraform plan` may be used to confirm that this directory creates no
resources. Do not add hosting resources until the dedicated games repository defines its
published `catalog.json` and bundle contract and the decisions in
[`docs/deployment.md`](../docs/deployment.md) are resolved.
