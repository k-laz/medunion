#!/usr/bin/env bash
# Checks medunion.group the way a search engine will see it after the switch:
#   - every address that answered 200 on the old site opens (200) or sends a 301 to a page that opens
#   - http -> https and www -> no www redirects
#   - robots.txt open with the sitemap, /sitemap.xml present, no noindex, canonical on the home page
#
#   bash scripts/check-switch.sh             the live domain, as it resolves now
#   bash scripts/check-switch.sh 1.2.3.4     the new server before the DNS change
#                                            (pretends medunion.group points to that IP)
set -uo pipefail
IP="${1:-}"
D=medunion.group
RES=()
[ -n "$IP" ] && RES=(--resolve "$D:443:$IP" --resolve "$D:80:$IP" --resolve "www.$D:443:$IP" --resolve "www.$D:80:$IP")
C=(curl -s --max-time 20 "${RES[@]}")
cd "$(dirname "$0")/.."
fail=0; ok=0; moved=0
report() { echo "FAIL  $*"; fail=$((fail+1)); }

# 1. Every old live address
mapfile -t URLS < <(awk -F'","' 'NR>1 && $3=="200" {gsub(/^"/,"",$1); print $1}' import/report.csv)
echo "Old live addresses: ${#URLS[@]}"
check_one() {
  local u="$1" out code final
  out=$("${C[@]}" -o /dev/null -L --max-redirs 3 -w '%{http_code} %{num_redirects} %{url_effective}' "https://$D$u")
  read -r code n final <<<"$out"
  if [ "$code" != 200 ]; then echo "FAIL  $u -> $code ($final)"; return; fi
  case "$final" in https://$D/*) ;; *) echo "FAIL  $u -> left the domain: $final"; return;; esac
  [ "$n" -gt 0 ] && echo "MOVED $u -> ${final#https://$D}" || echo "OK    $u"
}
export -f check_one; export D; export C_STR="${C[*]}"
RESULTS=$(printf '%s\n' "${URLS[@]}" | xargs -P 8 -I{} bash -c 'C=($C_STR); check_one "$@"' _ {})
ok=$(grep -c '^OK' <<<"$RESULTS"); moved=$(grep -c '^MOVED' <<<"$RESULTS"); urlfail=$(grep -c '^FAIL' <<<"$RESULTS"); fail=$urlfail
grep '^FAIL' <<<"$RESULTS"

# 2. Redirects between versions of the address
for pair in "http://$D/|https://$D/" "http://www.$D/|https://$D/" "https://www.$D/|https://$D/" "https://$D/uslugi|https://$D/uslugi/"; do
  from=${pair%|*}; want=${pair#*|}
  got=$("${C[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$from")
  [ "${got%% *}" = 301 ] && [ "${got#* }" = "$want" ] || report "$from should 301 to $want, got: $got"
done

# 3. What search engines read first
robots=$("${C[@]}" "https://$D/robots.txt")
grep -q '^Disallow: /$' <<<"$robots" && report "robots.txt blocks the whole site (preview build deployed?)"
grep -q "^Sitemap: https://$D/sitemap.xml" <<<"$robots" || report "robots.txt has no Sitemap line for /sitemap.xml"
[ "$("${C[@]}" -o /dev/null -w '%{http_code}' "https://$D/sitemap.xml")" = 200 ] || report "/sitemap.xml does not open"
[ "$("${C[@]}" -o /dev/null -L -w '%{http_code}' "https://$D/sitemap-iblock-13.xml")" = 200 ] || report "old sitemap file does not redirect to the new one"
home=$("${C[@]}" "https://$D/")
grep -q 'name="robots" content="noindex' <<<"$home" && report "home page has noindex"
grep -q "<link rel=\"canonical\" href=\"https://$D/\"" <<<"$home" || report "home page canonical is not https://$D/"
grep -q 'yandex-verification' <<<"$home" || report "Yandex verification tag missing"
[ "$("${C[@]}" -o /dev/null -w '%{http_code}' "https://$D/no-such-page-check/")" = 404 ] || report "a missing page does not answer 404"

echo
echo "Old addresses: $ok open as before, $moved redirect to their new page, $urlfail fail. Other checks failed: $((fail - urlfail))."
[ "$fail" -eq 0 ] && echo "ALL GOOD" || { echo "PROBLEMS FOUND"; exit 1; }
