#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="$(mktemp -d)"
trap 'rm -rf "$home"' EXIT
"$repo/install.sh" --home "$home" > /dev/null
HERDR_APP_HOME="$home" herdr-app check "$home/mods/fleet-lens"
