# Putting the site on a server

The site is plain files, so the server only needs nginx. Any Russian VPS with
Ubuntu 22.04 or 24.04 works; the smallest plan (1 CPU, 1 GB RAM) is enough.
Hosting in Russia keeps us in line with 152-FZ if the site later handles
patient data (for example the native booking form connected to the МИС).

**Quick way:** steps 1 to 3 below are done by one script. Log in to the
fresh server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/k-laz/medunion/main/deploy/setup-server.sh | sudo bash
```

It prints the three GitHub secrets at the end. The manual steps are kept
below for reference.

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

Step by step, with the certificate taken in advance and a dress rehearsal: the "switch-day runbook" doc. The check itself: `scripts/check-switch.sh` (GitHub Actions > Switch check).

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

- Yandex Webmaster: check the site is still verified, submit `https://medunion.group/sitemap.xml`, and watch "Страницы в поиске" for a few weeks.
- Metrica: confirm visits and goals keep coming in.
- Bitrix24: confirm calls and the chat button still create leads.
- Keep the old server running (on another address) for a month in case something was missed.

## 6. The Kansk site (kansk.medunion.group)

The same code builds a second site with only the Kansk city pages
(`npm run build:kansk`, see `src/data/city.ts`). The deploy uploads it to
`/var/www/medunion/kansk` and its redirects to `/var/www/medunion/redirects-kansk.conf`
on every push; nothing serves it until its nginx config is installed. Pages it does
not have (articles, news, patient information, Krasnoyarsk-only services) redirect
to the same address on medunion.group. Krasnoyarsk-only services (КТ, МРТ 1,5 Т,
ФГС, массаж, confirmed by the clinic 2026-11-12) are listed in `KRASNOYARSK_ONLY` in
`src/content.config.ts`; the Kansk site's titles and headings carry no city name
(`dropCity` in `src/data/city.ts`).

On the Kansk switch day (after the main domain has moved):

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt -d kansk.medunion.group   # after the DNS change
# or in advance with --manual --preferred-challenges dns, as for the main domain
sudo curl -fsSL -o /etc/nginx/sites-available/kansk.medunion.group https://raw.githubusercontent.com/k-laz/medunion/main/deploy/nginx/kansk.medunion.group.conf
sudo ln -sf /etc/nginx/sites-available/kansk.medunion.group /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then in Beget DNS change the `A` record of `kansk` to the server IP.
