#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 server for medunion.group.
# Run it once as root (it is safe to run again):
#
#   curl -fsSL https://raw.githubusercontent.com/k-laz/medunion/main/deploy/setup-server.sh | sudo bash
#
# It installs nginx, opens only ports 22/80/443, creates the "deploy" user
# that GitHub uploads the site with, and serves the site by IP for testing.
# At the end it prints the private key to paste into GitHub as DEPLOY_KEY.
# The key is made here, on the server, and only you see it.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 1; fi

echo "== Installing nginx, certbot, rsync, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx certbot rsync ufw unattended-upgrades

echo "== Folders and the deploy user"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
mkdir -p /var/www/medunion/site /var/www/letsencrypt
touch /var/www/medunion/redirects.conf
chown -R deploy:deploy /var/www/medunion
# deploy may only check and reload nginx, nothing else
echo 'deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload' > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

echo "== Upload key for GitHub"
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
KEY=/root/medunion_deploy
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "github deploy" -f "$KEY"
touch /home/deploy/.ssh/authorized_keys
grep -qF "$(cat "$KEY.pub")" /home/deploy/.ssh/authorized_keys || cat "$KEY.pub" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "== Test site on http://<server IP>/ (until the domain is switched)"
cat > /etc/nginx/sites-available/medunion-test <<'CONF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    root /var/www/medunion/site;
    index index.html;
    include /var/www/medunion/redirects.conf;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { try_files $uri $uri/ =404; }
    error_page 404 /404.html;
}
CONF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/medunion-test /etc/nginx/sites-enabled/medunion-test
[ -f /var/www/medunion/site/index.html ] || echo '<!doctype html><meta charset="utf-8"><p>Сервер готов, сайт ещё не загружен.</p>' > /var/www/medunion/site/index.html
chown -R deploy:deploy /var/www/medunion/site
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "== Firewall: only ssh, http, https"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
cat <<EOF

=====================================================================
Done. Now add three secrets in GitHub:
github.com/k-laz/medunion > Settings > Secrets and variables > Actions
> New repository secret

  DEPLOY_HOST   $IP
  DEPLOY_USER   deploy
  DEPLOY_KEY    everything between the two lines below, including
                the BEGIN and END lines

----- copy from here -----
$(cat "$KEY")
----- to here -----

Then: Actions > Build and deploy > Run workflow.
After it turns green, open http://$IP/ in a browser.
=====================================================================
EOF
