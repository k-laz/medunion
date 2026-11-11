#!/usr/bin/env bash
# Puts Sveltia CMS (the price editor at /admin/) into public/admin/, with its
# translations and fonts served from our own site instead of unpkg/jsDelivr,
# which are sometimes unreachable from Russia.
#   bash scripts/update-admin.sh 0.262.4
set -euo pipefail
V="${1:?version, e.g. 0.262.4}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/admin"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm pack -q "@sveltia/cms@$V" @fontsource-variable/material-symbols-outlined @fontsource/noto-mono @fontsource-variable/source-sans-3 >/dev/null
for f in *.tgz; do mkdir "${f%.tgz}"; tar xzf "$f" -C "${f%.tgz}"; done
S=$(ls -d sveltia-cms-*/package)
rm -rf "$OUT/chunks" "$OUT/locales" "$OUT/fonts"; mkdir -p "$OUT/fonts" "$OUT/locales"
cp "$S/dist/sveltia-cms.js" "$OUT/"; cp "$S/LICENSE.txt" "$OUT/SVELTIA-LICENSE.txt"; cp "$S"/locales/*.json "$OUT/locales/"
(cd "$S/dist" && find chunks -name '*.js' -exec install -D {} "$OUT/{}" \;)
cp fontsource-variable-material-symbols-outlined-*/package/files/material-symbols-outlined-latin-wght-normal.woff2 \
   fontsource-noto-mono-*/package/files/noto-mono-latin-400-normal.woff2 \
   fontsource-variable-source-sans-3-*/package/files/source-sans-3-latin-wght-normal.woff2 "$OUT/fonts/"
for d in fontsource-*/package; do n=$(basename "$(dirname "$d")" | sed -E 's/-[0-9.]+$//'); cp "$d/LICENSE" "$OUT/fonts/LICENSE-$n" 2>/dev/null || true; done
# Point the CDN addresses at our copies (relative to /admin/).
sed -i -E \
  -e "s#https://unpkg.com/@sveltia/cms@$V/locales#./locales#g" \
  -e 's#https://cdn.jsdelivr.net/fontsource/fonts/material-symbols-outlined:vf@[0-9.]+/latin-wght-normal.woff2#./fonts/material-symbols-outlined-latin-wght-normal.woff2#g' \
  -e 's#https://cdn.jsdelivr.net/fontsource/fonts/noto-mono@[0-9.]+/latin-400-normal.woff2#./fonts/noto-mono-latin-400-normal.woff2#g' \
  -e 's#https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3:vf@[0-9.]+/latin-wght-normal.woff2#./fonts/source-sans-3-latin-wght-normal.woff2#g' \
  "$OUT/sveltia-cms.js"
echo "Sveltia CMS $V in $OUT"; grep -c 'cdn.jsdelivr.net/fontsource\|unpkg.com/@sveltia/cms@'"$V"'/locales' "$OUT/sveltia-cms.js" || true
