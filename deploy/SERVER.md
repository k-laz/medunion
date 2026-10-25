# Putting the site on a server

The site is plain files, so the server only needs nginx. Any Russian VPS with
Ubuntu 22.04 or 24.04 works; the smallest plan (1 CPU, 1 GB RAM) is enough.
Hosting in Russia keeps us in line with 152-FZ if the site later handles
patient data (for example the native booking form connected to the МИС).

Everything below is done once. After that, every push to `main` on GitHub
rebuilds the site and uploads it automatically (`.github/workflows/deploy.yml`).

## 1. Prepare the server

Log in as root (the provider gives you the IP and password), then:

```bash
apt update && apt install -y nginx certbot rsync
adduser --disabled-password --gecos "" deploy
mkdir -p /var/www/medunion/site /var/www/letsencrypt
touch /var/www/medunion/redirects.conf
chown -R deploy:deploy /var/www/medunion

# let the deploy user check and reload nginx, nothing else
echo 'deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload' > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy
```

## 2. Give GitHub a key for uploads

On your laptop:

```bash
ssh-keygen -t ed25519 -f medunion_deploy -N "" -C "github deploy"
```

Put the public key on the server:

```bash
mkdir -p /home/deploy/.ssh
echo "<contents of medunion_deploy.pub>" >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

In GitHub: repository Settings > Secrets and variables > Actions > New repository secret:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | the server IP |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KEY` | the whole contents of the private key file `medunion_deploy` |

Then run the workflow once (Actions > Build and deploy > Run workflow), so the
files are on the server before nginx is switched on.

## 3. Test before switching the domain

Until the domain points to the new server, open the site by IP. Temporary
config without https:

```bash
cat > /etc/nginx/sites-available/medunion-test <<'CONF'
server {
    listen 80 default_server;
    root /var/www/medunion/site;
    index index.html;
    include /var/www/medunion/redirects.conf;
    location / { try_files $uri $uri/ =404; }
    error_page 404 /404.html;
}
CONF
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/medunion-test /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Open `http://<server IP>/` and click around. Booking, phone links and the
pages should all work (Metrica and chat only run on the real domain).

## 4. Switch the domain

1. Lower the TTL of the `medunion.group` DNS records to 300 a day before.
2. Change the `A` records of `medunion.group` and `www.medunion.group` to the new server IP.
3. When the domain opens the new server, get the certificate and enable the real config:

```bash
certbot certonly --webroot -w /var/www/letsencrypt -d medunion.group -d www.medunion.group
cp /path/to/repo/deploy/nginx/medunion.group.conf /etc/nginx/sites-available/medunion.group
rm /etc/nginx/sites-enabled/medunion-test
ln -s /etc/nginx/sites-available/medunion.group /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

certbot renews the certificate by itself.

## 5. After the switch

- Yandex Webmaster: check the site is still verified, submit `https://medunion.group/sitemap-index.xml`, and watch "Страницы в поиске" for a few weeks.
- Metrica: confirm visits and goals keep coming in.
- Bitrix24: confirm calls and the chat button still create leads.
- Keep the old server running (on another address) for a month in case something was missed.
