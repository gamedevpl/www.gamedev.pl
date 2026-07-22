terraform {
  required_version = ">= 1.5.0"
}

# Intentionally no resources.
#
# The previous configuration targeted the retired container-generation architecture. New
# infrastructure will be introduced only after the games repository, publishing origin, and
# minimal submission API have stable contracts. See docs/deployment.md.
