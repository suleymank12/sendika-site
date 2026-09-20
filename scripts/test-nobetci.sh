#!/usr/bin/env bash
# =============================================================================
# test-nobetci.sh — scripts/nobetci.sh testi (stub openssl / nginx / curl / stat)
# =============================================================================
# ÇALIŞTIRMA:
#   npm run test:nobetci
#   bash scripts/test-nobetci.sh
#
# Bu test HER ORTAMDA koşar (Git Bash / WSL / VPS): gerçek sertifika, gerçek
# nginx, gerçek ağ ve gerçek chmod GEREKMEZ — hepsi stub'lanır.
#   - openssl : sahte cert.pem dosyasının İÇİNDEKİ tarihi notAfter= olarak döner
#   - nginx   : çıkış kodunu ve çıktısını ortam değişkeninden alır
#   - curl    : hem Cloudflare çağrısını hem Healthchecks ping'ini kaydeder
#   - stat    : izin değerini ortam değişkeninden döner (NTFS'te chmod etkisiz)
#
# NEYİ DOĞRULAR:
#   (a) sağlıklı koşum: exit 0, durum=OK, ping GÖVDESİYLE atılır
#   (b) sertifika eşikleri: alarm (<21g), uyarı (21-24g), sağlam (>=25g),
#       süresi dolmuş (negatif), kırık bağlantı, okunamayan tarih, hiç yok
#   (c) nginx: -t düşerse alarm + [emerg] satırı sebebe girer; yok; askıda
#   (d) cloudflare: dosya yok / token satırı yok / global anahtar biçimi /
#       bozuk biçim / REDDEDİLDİ / ULAŞILAMADI / PASİF / OK
#   (e) 🔴 SIR HİJYENİ: anahtar ne çıktıya, ne ping gövdesine, ne curl argv'sine
#       geçer; curl'e YALNIZ ayar dosyasıyla verilir
#   (f) ping adresi yoksa SESSİZ GEÇMEZ: exit 1 + sebep + ping denenmez
#   (g) ilk hatada durmaz: üç kontrol de koşar, sorunlar tek satırda toplanır
#   (h) 🔴 YAN ETKİSİZLİK: nginx'e yalnız -t verilir (reload/restart YOK),
#       sertifika/ini dosyaları değişmez, script kendi log dosyası açmaz
#   (i) başarısızlıkta /fail son eki, başarıda düz adres
# =============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/scripts/nobetci.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

PASS=0
FAIL=0

ok() { # ad çıktı beklenen
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $1"; echo "          çıktı : $2"; echo "          bekle : $3"
  fi
}
icerir() { # ad dosya desen
  if grep -Eq -- "$3" "$2" 2>/dev/null; then ok "$1" var var; else ok "$1" yok var; fi
}
icermez() { # ad dosya desen
  if grep -Eq -- "$3" "$2" 2>/dev/null; then ok "$1" var yok; else ok "$1" yok yok; fi
}

# --- Stub'lar -----------------------------------------------------------------
mkdir -p "$T/bin"

# openssl: cert.pem içeriği = notAfter değeri. İçerik "BOZUK" ise hata verir.
cat > "$T/bin/openssl" <<'STUB'
#!/usr/bin/env bash
dosya=""
while [ $# -gt 0 ]; do
  case "$1" in -in) dosya="$2"; shift 2 ;; *) shift ;; esac
done
icerik=$(cat "$dosya" 2>/dev/null)
if [ "$icerik" = "BOZUK" ]; then
  echo "unable to load certificate" >&2
  exit 1
fi
echo "notAfter=$icerik"
STUB

# nginx: -t çıktısı/çıkış kodu ortamdan. Verilen argümanlar kaydedilir
# (yan etkisizlik kanıtı: yalnız "-t" görülmeli).
cat > "$T/bin/nginx" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" >> "$STUB_DIR/nginx.args"
printf '%s\n' "${STUB_NGINX_CIKTI:-nginx: configuration file /etc/nginx/nginx.conf test is successful}"
exit "${STUB_NGINX_EXIT:-0}"
STUB

# curl: --config varsa Cloudflare çağrısı, yoksa Healthchecks ping'i.
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" >> "$STUB_DIR/curl.args"
mod="ping"; cikti=""; adres=""; govde=""; ayar=""
argv=("$@")
i=0
while [ $i -lt ${#argv[@]} ]; do
  a="${argv[$i]}"
  case "$a" in
    --config)    mod="cf"; ayar="${argv[$((i+1))]}"; i=$((i+2)) ;;
    -o)          cikti="${argv[$((i+1))]}"; i=$((i+2)) ;;
    --data-raw)  govde="${argv[$((i+1))]}"; i=$((i+2)) ;;
    -H|-m|-w|--connect-timeout|--retry|--retry-delay) i=$((i+2)) ;;
    -*)          i=$((i+1)) ;;
    *)           adres="$a"; i=$((i+1)) ;;
  esac
done
if [ "$mod" = "cf" ]; then
  # Ayar dosyasının İÇERİĞİ kaydedilir: anahtarın gerçekten buradan geçtiğini
  # ve argv'ye sızmadığını test doğrulayacak.
  cat "$ayar" > "$STUB_DIR/cf.config" 2>/dev/null
  [ -n "$cikti" ] && printf '%s' "${STUB_CF_JSON:-{\"success\":true,\"result\":{\"status\":\"active\"}\}}" > "$cikti"
  printf '%s' "${STUB_CF_HTTP:-200}"
  if [ "${STUB_CF_CURL_EXIT:-0}" != 0 ]; then
    echo "curl: (6) Could not resolve host: api.cloudflare.com" >&2
    exit "${STUB_CF_CURL_EXIT}"
  fi
  exit 0
fi
printf '%s' "$adres" > "$STUB_DIR/ping.url"
printf '%s' "$govde" > "$STUB_DIR/ping.body"
echo "ping" >> "$STUB_DIR/ping.count"
if [ "${STUB_PING_EXIT:-0}" != 0 ]; then
  echo "curl: (28) Operation timed out" >&2
  exit "${STUB_PING_EXIT}"
fi
exit 0
STUB

# stat: NTFS'te chmod etkisiz olduğu için izin değeri ortamdan gelir.
cat > "$T/bin/stat" <<'STUB'
#!/usr/bin/env bash
yol="${*: -1}"
case "$yol" in
  *cloudflare*)   echo "${STUB_IZIN_CF:-600}" ;;
  *healthchecks*) echo "${STUB_IZIN_HC:-600}" ;;
  *)              echo "600" ;;
esac
STUB

chmod +x "$T/bin/"*

# --- Sabit dosyalar -----------------------------------------------------------
CF_INI="$T/cloudflare.ini"
cat > "$CF_INI" <<'INI'
# Cloudflare API token (certbot dns-cloudflare)
dns_cloudflare_api_token = AbCdEf0123456789_XyZ-abcdef0123456789
INI
TOKEN="AbCdEf0123456789_XyZ-abcdef0123456789"

HC_ENV="$T/healthchecks.env"
printf 'HC_URL_DB=https://hc-ping.com/aaaa\nHC_URL_NOBETCI=https://hc-ping.com/nobetci-uuid\n' > "$HC_ENV"

# Sertifika ağacı: live/<ad>/cert.pem içeriği = notAfter değeri
LE="$T/live"
# Sertifika fiksturu. 6 saatlik pay BILEREK var: script kalan gunu TAM SAYIYA
# ASAGI yuvarlar (temkinli taraf), pay olmadan "+60 gun" kosum aninda 59'a
# duser ve test saniyeye bagli olarak zar atardi.
cert_kur() { # ad gun_sonra
  mkdir -p "$LE/$1"
  local ofs="+6 hours"
  [ "$2" -lt 0 ] && ofs="-6 hours"
  date -d "$2 days $ofs" -u "+%b %d %H:%M:%S %Y GMT" > "$LE/$1/cert.pem"
}
sifirla_le() { rm -rf "$LE"; mkdir -p "$LE"; }

# --- Koşucu -------------------------------------------------------------------
STUB_DIR="$T/kayit"
kos() { # ek ortam değişkenleri env olarak önden verilir
  rm -rf "$STUB_DIR"; mkdir -p "$STUB_DIR"
  CIKTI="$T/cikti.txt"
  env PATH="$T/bin:$PATH" STUB_DIR="$STUB_DIR" \
      LE_DIZIN="$LE" CF_INI="$CF_INI" HEALTHCHECKS_ENV="$HC_ENV" \
      CF_API="https://api.cloudflare.com/client/v4" \
      "$@" bash "$SCRIPT" > "$CIKTI" 2>&1
  KOD=$?
}

echo "== nobetci.sh =="

# ---------------------------------------------------------------------------
echo "-- (a) sağlıklı koşum"
sifirla_le
cert_kur "buyukdirilis.org.tr" 89
cert_kur "kurmayteknoloji.com" 60
SERT_ONCE=$(cat "$LE/buyukdirilis.org.tr/cert.pem")
kos
ok "(a) çıkış kodu 0" "$KOD" 0
icerir "(a) durum=OK" "$CIKTI" 'durum=OK'
icerir "(a) sertifika sayısı 2/2" "$CIKTI" 'sertifika=2/2'
icerir "(a) en az kalan gün 60 ve adı yazılı" "$CIKTI" 'en_az=60g\(kurmayteknoloji\.com\)'
icerir "(a) nginx=OK" "$CIKTI" 'nginx=OK'
icerir "(a) cloudflare=OK" "$CIKTI" 'cloudflare=OK'
icerir "(a) uyarı yok" "$CIKTI" 'uyari=0'
ok "(a) ping tam olarak 1 kez atıldı" "$(wc -l < "$STUB_DIR/ping.count" | tr -d ' ')" 1
ok "(a) ping düz adrese (fail YOK)" "$(cat "$STUB_DIR/ping.url")" "https://hc-ping.com/nobetci-uuid"
icerir "(a) ping gövdesinde özet var" "$STUB_DIR/ping.body" 'durum=OK sertifika=2/2'

echo "-- (h) yan etkisizlik"
ok "(h) nginx'e yalnız -t verildi" "$(tr -d ' \n' < "$STUB_DIR/nginx.args")" "-t"
icermez "(h) nginx reload edilmedi" "$STUB_DIR/nginx.args" '^(-s|reload|restart)$'
ok "(h) sertifika dosyası değişmedi" "$(cat "$LE/buyukdirilis.org.tr/cert.pem")" "$SERT_ONCE"
ok "(h) cloudflare.ini değişmedi" "$(grep -c 'dns_cloudflare_api_token' "$CF_INI")" 1
ok "(h) script log dosyası açmadı" "$(find "$T" -maxdepth 1 -name '*.log' | wc -l | tr -d ' ')" 0

echo "-- (e) 🔴 sır hijyeni"
icermez "(e) anahtar çıktıya sızmadı" "$CIKTI" "$TOKEN"
icermez "(e) anahtar ping gövdesine sızmadı" "$STUB_DIR/ping.body" "$TOKEN"
icermez "(e) anahtar curl argv'sine sızmadı" "$STUB_DIR/curl.args" "$TOKEN"
icerir "(e) anahtar curl'e AYAR DOSYASIYLA verildi" "$STUB_DIR/cf.config" "Authorization: Bearer $TOKEN"
icerir "(e) curl --config kullandı" "$STUB_DIR/curl.args" '^--config$'
ok "(e) geçici ayar dosyası koşumdan sonra kalmadı" "$(find /tmp -maxdepth 2 -name 'cf.conf' 2>/dev/null | wc -l | tr -d ' ')" 0

# ---------------------------------------------------------------------------
echo "-- (b) sertifika eşikleri"
sifirla_le; cert_kur "az-kaldi.org" 12; cert_kur "saglam.org" 80
kos
ok "(b) 12 gün → çıkış kodu 1" "$KOD" 1
icerir "(b) durum=HATA" "$CIKTI" 'durum=HATA'
icerir "(b) sebepte ad ve gün var" "$CIKTI" 'az-kaldi\.org: sertifikaya 12 gün kaldı'
icerir "(b) sebepte eşik yazılı" "$CIKTI" 'alarm eşiği 21'
icerir "(b) sebepte ne yapılacağı yazılı" "$CIKTI" 'certbot renew --dry-run'
ok "(b) /fail adresine ping" "$(cat "$STUB_DIR/ping.url")" "https://hc-ping.com/nobetci-uuid/fail"
icerir "(b) /fail gövdesinde sebep var" "$STUB_DIR/ping.body" 'sebep="az-kaldi\.org'

sifirla_le; cert_kur "sinirda.org" 23
kos
ok "(b) 23 gün → uyarı, çıkış kodu 0" "$KOD" 0
icerir "(b) uyarı sayısı 1" "$CIKTI" 'uyari=1'
icerir "(b) uyarı metni doğru" "$CIKTI" 'uyarı eşiği 25'
icermez "(b) 23 gün alarm DEĞİL" "$CIKTI" 'durum=HATA'

sifirla_le; cert_kur "tam-sinir.org" 25
kos
ok "(b) 25 gün → temiz, çıkış kodu 0" "$KOD" 0
icerir "(b) 25 günde uyarı yok" "$CIKTI" 'uyari=0'

sifirla_le; cert_kur "dolmus.org" -3
kos
ok "(b) süresi dolmuş → çıkış kodu 1" "$KOD" 1
icerir "(b) 'gün ÖNCE doldu' denir" "$CIKTI" 'dolmus\.org: sertifika 3 gün ÖNCE doldu'

sifirla_le; cert_kur "kirik.org" 80; rm -f "$LE/kirik.org/cert.pem"
kos
ok "(b) kırık bağlantı → çıkış kodu 1" "$KOD" 1
icerir "(b) kırık bağlantı SESSİZ atlanmadı" "$CIKTI" 'kirik\.org: cert\.pem okunamıyor'

sifirla_le; cert_kur "bozuk.org" 80; echo "BOZUK" > "$LE/bozuk.org/cert.pem"
kos
ok "(b) openssl hatası → çıkış kodu 1" "$KOD" 1
icerir "(b) openssl hatası bildirildi" "$CIKTI" 'bozuk\.org: sertifika okunamadı'

sifirla_le; mkdir -p "$LE/tarihsiz.org"; echo "bu bir tarih degil" > "$LE/tarihsiz.org/cert.pem"
kos
ok "(b) çözümlenemeyen tarih → çıkış kodu 1" "$KOD" 1
icerir "(b) tarih hatası bildirildi" "$CIKTI" 'bitiş tarihi çözümlenemedi'

sifirla_le
kos
ok "(b) hiç sertifika yok → çıkış kodu 1" "$KOD" 1
icerir "(b) 'hiç sertifika yok' denir" "$CIKTI" 'hiç sertifika yok'

kos LE_DIZIN="$T/olmayan-dizin"
ok "(b) dizin yok → çıkış kodu 1" "$KOD" 1
icerir "(b) dizin yok bildirildi" "$CIKTI" 'sertifika dizini yok'

# ---------------------------------------------------------------------------
echo "-- (c) nginx"
sifirla_le; cert_kur "ok.org" 80
kos STUB_NGINX_EXIT=1 STUB_NGINX_CIKTI='nginx: [emerg] unknown directive "servr" in /etc/nginx/sites-enabled/kurmay.conf:12
nginx: configuration file /etc/nginx/nginx.conf test failed'
ok "(c) nginx -t düştü → çıkış kodu 1" "$KOD" 1
icerir "(c) nginx=BOZUK" "$CIKTI" 'nginx=BOZUK'
icerir "(c) sebepte [emerg] satırı var" "$CIKTI" 'unknown directive .servr. in /etc/nginx/sites-enabled/kurmay\.conf:12'
icerir "(c) sonucun ne olacağı yazılı" "$CIKTI" 'BÜTÜN kurum siteleri açılmaz'
ok "(c) /fail atıldı" "$(cat "$STUB_DIR/ping.url")" "https://hc-ping.com/nobetci-uuid/fail"

kos STUB_NGINX_EXIT=124
ok "(c) nginx askıda → çıkış kodu 1" "$KOD" 1
icerir "(c) nginx=ASKIDA" "$CIKTI" 'nginx=ASKIDA'

kos NGINX_BIN="olmayan-nginx-komutu"
ok "(c) nginx yok → çıkış kodu 1" "$KOD" 1
icerir "(c) nginx bulunamadı bildirildi" "$CIKTI" 'nginx bulunamadı'

# ---------------------------------------------------------------------------
echo "-- (d) cloudflare"
kos CF_INI="$T/olmayan.ini"
ok "(d) ini yok → çıkış kodu 1" "$KOD" 1
icerir "(d) ini yok bildirildi" "$CIKTI" 'cloudflare anahtar dosyası okunamıyor'

printf 'baska_alan = 1\n' > "$T/bossuz.ini"
kos CF_INI="$T/bossuz.ini"
ok "(d) token satırı yok → çıkış kodu 1" "$KOD" 1
icerir "(d) token satırı yok bildirildi" "$CIKTI" 'dns_cloudflare_api_token satırı yok'

printf 'dns_cloudflare_email = a@b.c\ndns_cloudflare_api_key = eski-global-anahtar\n' > "$T/global.ini"
kos CF_INI="$T/global.ini"
ok "(d) global anahtar biçimi → çıkış kodu 1" "$KOD" 1
icerir "(d) global biçim NET söylenir" "$CIKTI" 'global API anahtarı biçiminde'
icermez "(d) global anahtar değeri sızmadı" "$CIKTI" 'eski-global-anahtar'

# Boşluk İÇERMEYEN ama geçersiz karakterli değer: ayrıştırıcı ilk boşlukta
# kestiği için boşluklu bir değer "kısa anahtar" dalına düşerdi; bu fikstür
# biçim dalını sınar. printf '%s' — değerdeki % ve $ biçim olarak yorumlanmasın.
printf '%s\n' 'dns_cloudflare_api_token = abc$def!ghi0123456789012345678901' > "$T/bicim.ini"
kos CF_INI="$T/bicim.ini"
ok "(d) bozuk biçim → çıkış kodu 1" "$KOD" 1
icerir "(d) biçim hatası bildirildi" "$CIKTI" 'beklenen biçimde değil'
ok "(d) bozuk biçimde curl HİÇ çağrılmadı (CF)" "$([ -f "$STUB_DIR/cf.config" ] && echo var || echo yok)" "yok"

printf 'dns_cloudflare_api_token = kisa123\n' > "$T/kisa.ini"
kos CF_INI="$T/kisa.ini"
ok "(d) kısa anahtar → çıkış kodu 1" "$KOD" 1
icerir "(d) kısa anahtar bildirildi" "$CIKTI" 'beklenenden kısa'

kos STUB_CF_HTTP=403 STUB_CF_JSON='{"success":false,"errors":[{"code":9109,"message":"Invalid access token"}],"result":null}'
ok "(d) reddedildi → çıkış kodu 1" "$KOD" 1
icerir "(d) cloudflare=REDDEDILDI" "$CIKTI" 'cloudflare=REDDEDILDI'
icerir "(d) sebepte HTTP kodu var" "$CIKTI" 'HTTP 403'
icerir "(d) sebepte API hata kodu var" "$CIKTI" 'kod 9109: Invalid access token'
icerir "(d) IP filtresi olasılığı yazılı" "$CIKTI" '185\.33\.234\.67'
icermez "(d) reddedilme hâlinde de anahtar sızmadı" "$CIKTI" "$TOKEN"

kos STUB_CF_CURL_EXIT=6
ok "(d) ağ hatası → çıkış kodu 1" "$KOD" 1
icerir "(d) cloudflare=ULASILAMADI" "$CIKTI" 'cloudflare=ULASILAMADI'
icerir "(d) 'bozuk demek değil' ayrımı yapılıyor" "$CIKTI" 'ANLAMINA GELMEZ'

kos STUB_CF_JSON='{"success":true,"result":{"status":"disabled"}}'
ok "(d) pasif anahtar → çıkış kodu 1" "$KOD" 1
icerir "(d) cloudflare=PASIF" "$CIKTI" 'cloudflare=PASIF'
icerir "(d) durum sebepte yazılı" "$CIKTI" 'durum=disabled'

kos STUB_CF_JSON='{"success":true,"result":{}}'
ok "(d) durum alanı yok → sahte alarm YOK (exit 0)" "$KOD" 0
icerir "(d) durum alanı yok → uyarı bırakıldı" "$CIKTI" 'durum alanı okunamadı'

# ---------------------------------------------------------------------------
echo "-- (f) ping adresi yoksa sessiz geçilmez"
kos HEALTHCHECKS_ENV="$T/olmayan-hc.env"
ok "(f) adres dosyası yok → çıkış kodu 1" "$KOD" 1
icerir "(f) durum=HATA" "$CIKTI" 'durum=HATA'
icerir "(f) sebep net" "$CIKTI" 'ping adresi dosyası okunamadı'
icerir "(f) 'haber veremez' denir" "$CIKTI" 'nöbetçi haber veremez'
ok "(f) ping DENENMEDİ" "$([ -f "$STUB_DIR/ping.url" ] && echo var || echo yok)" "yok"

printf 'HC_URL_NOBETCI=\n' > "$T/bos-hc.env"
kos HEALTHCHECKS_ENV="$T/bos-hc.env"
ok "(f) adres boş → çıkış kodu 1" "$KOD" 1
icerir "(f) boş adres bildirildi" "$CIKTI" 'ping adresi boş'

printf 'HC_URL_NOBETCI=http://hc-ping.com/x\n' > "$T/http-hc.env"
kos HEALTHCHECKS_ENV="$T/http-hc.env"
ok "(f) https değil → çıkış kodu 1" "$KOD" 1
icerir "(f) https şartı bildirildi" "$CIKTI" 'https:// ile başlamıyor'

kos HEALTHCHECKS_ENV="$T/olmayan-hc.env" HC_URL_NOBETCI="https://hc-ping.com/elle-verilen"
ok "(f) ortam değişkeni dosyayı atlar → çıkış kodu 0" "$KOD" 0
ok "(f) elle verilen adrese ping atıldı" "$(cat "$STUB_DIR/ping.url")" "https://hc-ping.com/elle-verilen"

kos STUB_PING_EXIT=28
ok "(f) ping gönderilemedi → sonuç değişmez (exit 0)" "$KOD" 0
icerir "(f) ping hatası SESSİZ geçmedi" "$CIKTI" 'ping GÖNDERİLEMEDİ'

echo "-- (w) izin uyarıları"
kos STUB_IZIN_HC=644
ok "(w) hc env izni gevşek → yine de exit 0" "$KOD" 0
icerir "(w) hc env izni uyarısı var" "$CIKTI" 'izni 644 — 600 olmalı'
kos STUB_IZIN_CF=644
ok "(w) cloudflare.ini izni gevşek → alarm DEĞİL (exit 0)" "$KOD" 0
icerir "(w) cloudflare.ini izin uyarısı var" "$CIKTI" 'API anahtarı dosyada açık duruyor'

# ---------------------------------------------------------------------------
echo "-- (g) ilk hatada durmaz — bütün sorunlar tek satırda"
sifirla_le; cert_kur "az-kaldi.org" 5
kos STUB_NGINX_EXIT=1 STUB_CF_HTTP=403 \
    STUB_CF_JSON='{"success":false,"errors":[{"code":9109,"message":"Invalid access token"}]}'
ok "(g) çıkış kodu 1" "$KOD" 1
icerir "(g) sertifika sorunu var" "$CIKTI" 'az-kaldi\.org: sertifikaya 5 gün kaldı'
icerir "(g) nginx sorunu AYNI satırda" "$CIKTI" 'nginx ayarı BOZUK'
icerir "(g) cloudflare sorunu AYNI satırda" "$CIKTI" 'cloudflare anahtarı REDDEDİLDİ'
ok "(g) çıktı tek satır" "$(grep -c 'durum=' "$CIKTI")" 1
icerir "(g) üç sorun ' | ' ile ayrıldı" "$CIKTI" '\|.*\|'

echo
echo "SONUC: $PASS gecti, $FAIL kaldi"
[ "$FAIL" = 0 ] || exit 1
