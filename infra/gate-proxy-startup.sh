#!/bin/bash
#
# Startup script for the gate egress proxy VM (infra/setup-gate-egress.sh). Runs on every
# boot, so the allow-list in instance metadata is the source of truth and a reset applies
# a changed one.
#
# Policy: only the pool's range, only CONNECT, only port 443, only the listed names.
# `dstdomain -n` matches the name in the CONNECT line and never reverse-resolves an IP
# literal, so an IP cannot borrow an allowed host's name.

set -euo pipefail

metadata() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"
}

if ! command -v squid >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends squid
fi

metadata gate-allowed-domains | tr ' ' '\n' | sed '/^$/d' >/etc/squid/gate-allowed-domains
POOL_RANGE="$(metadata gate-pool-range)"

cat >/etc/squid/squid.conf <<CONF
http_port 3128
acl gate_pool src ${POOL_RANGE}
acl https_port port 443
acl CONNECT method CONNECT
acl gate_allowed dstdomain -n "/etc/squid/gate-allowed-domains"
http_access deny !gate_pool
http_access deny !CONNECT
http_access deny !https_port
http_access allow gate_allowed
http_access deny all
cache deny all
forwarded_for delete
access_log daemon:/var/log/squid/access.log squid
coredump_dir /var/spool/squid
CONF

squid -k parse -f /etc/squid/squid.conf
systemctl enable squid
systemctl restart squid
