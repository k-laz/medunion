#!/usr/bin/env bash
# One-time setup of the booking API on the server (after setup-server.sh).
# Run as root:  sudo bash setup-api.sh
# Installs Node.js 22, a service user, the systemd service and the settings
# file /etc/medunion-api.env (empty; you fill in the МИС address and token).
# The GitHub deploy then uploads server.mjs to /opt/medunion-api and restarts it.
set -euo pipefail
cd "$(dirname "$0")"

echo "== Node.js 22"
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node -v

echo "== Service user and folder"
id medunion-api >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin medunion-api
install -d -m 755 -o deploy -g deploy /opt/medunion-api
install -m 644 -o deploy -g deploy api/server.mjs /opt/medunion-api/server.mjs

echo "== Settings file /etc/medunion-api.env"
if [ ! -f /etc/medunion-api.env ]; then
  install -m 600 -o root -g root api/medunion-api.env.example /etc/medunion-api.env
  echo "   created; fill in MIS_BASE_URL and MIS_API_TOKEN:  sudo nano /etc/medunion-api.env"
else
  echo "   already there, left as is"
fi

echo "== systemd service"
install -m 644 api/medunion-api.service /etc/systemd/system/medunion-api.service
systemctl daemon-reload
systemctl enable medunion-api

echo "== Let the GitHub deploy restart it"
cat > /etc/sudoers.d/medunion-api <<'SUDO'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart medunion-api
SUDO
chmod 440 /etc/sudoers.d/medunion-api
visudo -cf /etc/sudoers.d/medunion-api

echo "== nginx: /api/ on the test site"
CONF=/etc/nginx/sites-available/medunion-test
if [ -f "$CONF" ] && ! grep -q 'location /api/' "$CONF"; then
  sed -i 's|^    location / { try_files|    location /api/ { include /etc/nginx/medunion-api.conf; }\n    location / { try_files|' "$CONF"
fi
install -m 644 nginx/medunion-api.conf /etc/nginx/medunion-api.conf
nginx -t && systemctl reload nginx

echo
echo "Next:"
echo "  1. sudo nano /etc/medunion-api.env      (МИС address and token)"
echo "  2. sudo systemctl restart medunion-api"
echo "  3. sudo bash -c 'set -a; . /etc/medunion-api.env; node /opt/medunion-api/server.mjs --check'"
echo "  4. curl -s http://127.0.0.1/api/booking/health"
