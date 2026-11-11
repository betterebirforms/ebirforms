#!/usr/bin/env bash
# `apt-install.sh <package>...` on a GitHub Ubuntu runner: install, retrying, and if the runner's own DNS can't
# resolve Ubuntu's mirrors (it couldn't for hours on 2026-11-11), switch the runner to public resolvers and retry.
set -u
try() { sudo apt-get update -q && sudo apt-get install -y -q "$@"; }
# checked before the first try: with DNS down, one apt run over a long package list takes 20+ minutes to fail
dns_check() {
  for h in archive.ubuntu.com security.ubuntu.com; do getent hosts "$h" >/dev/null || return 1; done
}
public_dns() {
  echo "apt-install: the runner can't resolve Ubuntu's mirrors; using 1.1.1.1 and 8.8.8.8"
  sudo mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\nFallbackDNS=9.9.9.9\n' | sudo tee /etc/systemd/resolved.conf.d/public.conf >/dev/null
  sudo systemctl restart systemd-resolved || echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf >/dev/null
}
for attempt in 1 2 3; do
  dns_check || public_dns
  try "$@" && exit 0
  sleep $((attempt * 15))
done
exit 1
