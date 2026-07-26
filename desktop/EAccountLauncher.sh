#!/bin/zsh
set -eu
ROOT="$(cd "$(dirname "$0")/../Resources/e-account" && pwd)"
PORT=4173
URL="http://127.0.0.1:${PORT}/?surface=desktop"
if ! /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1; then
  /usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/tmp/e-account-desktop-server.log 2>&1 &
  for _ in {1..20}; do
    /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1 && break
    /bin/sleep 0.15
  done
fi
/usr/bin/open "$URL"
