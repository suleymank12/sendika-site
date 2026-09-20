#!/usr/bin/env bash
# =============================================================================
# nobetci.sh — sunucu nöbetçisi: sertifika + nginx ayarı + Cloudflare anahtarı
# =============================================================================
#
# NEDEN VAR (20 Eylül 2026 bulgusu): certbot.timer AYLARDIR günde iki kez
#   sessizce başarısız oluyordu ve kimse bilmiyordu. "Sessiz başarısızlık" bu
#   projede tekrar eden bir kusur sınıfı (yedek bildirimi, storage yetimleri,
#   og:image). Bu script o sınıfa karşı bir dead-man's switch: her gün ölçer,
#   sonucu Healthchecks.io'ya bildirir. Ping GELMEZSE de alarm çalar — yani
#   script'in kendisi çökse/askıda kalsa bile sessizlik alarma dönüşür.
#
# 🔴 YAN ETKİSİZDİR. Çalıştırdığı komutların TAMAMI salt okunur:
#     openssl x509 -noout -enddate   (sertifika dosyasını okur)
#     nginx -t                       (ayarı SINAR — reload/restart YAPMAZ)
#     curl … api.cloudflare.com/client/v4/user/tokens/verify   (GET)
#   Hiçbir sertifika yenilenmez, hiçbir servis reload edilmez, hiçbir ayar
#   düzeltilmez, diske (kendi geçici dizini dışında) hiçbir şey yazılmaz.
#   Teşhis eder ve haber verir; onarım İNSANIN işidir.
#
# ---------------------------------------------------------------------------
# NEYİ KONTROL EDER
# ---------------------------------------------------------------------------
#
# 1) SERTİFİKA SÜRESİ — /etc/letsencrypt/live/*/cert.pem
#
#    EŞİK: ALARM 21 gün, UYARI 25 gün. Gerekçe:
#      - certbot yenileme penceresi 30 gün. Yani 30'un altı "yenilenmeliydi".
#      - 30'da alarm vermek YANLIŞ olurdu: certbot.timer günde iki kez ve
#        rastgele gecikmeyle çalışır; bir sertifika normal akışta da birkaç
#        saat 29,x günde durur. Her sertifika her 60 günde bir sahte alarm
#        üretirdi — alarm körlüğü, sessiz başarısızlığın kardeşi.
#      - 30 → 21 arası certbot'a ~18 yenileme denemesi tanır. 18 denemenin
#        hepsi düştüyse bu geçici bir ağ hıçkırığı değil, gerçek bir arıza.
#      - 21 gün, haber geldiğinde elde 3 hafta kalması demek: DNS/API/disk
#        ne bozulmuşsa paniklemeden çözülür.
#      - 25 günlük UYARI eşiği, alarmdan 4 gün önce "yenileme gecikiyor"
#        sinyalini Healthchecks gövdesine yazar (alarm değil, kayıt).
#
#    KIRIK BAĞLANTI DA HATADIR: live/<ad>/cert.pem bir symlink'tir. Hedefi
#    yoksa dosya "yok" sayılıp SESSİZCE atlanmaz — alarm verilir.
#
# 2) NGINX AYARI — `nginx -t`
#    "Ayar bozuk ama henüz reload edilmedi" durumunu yakalar. O hâlde bir
#    sonraki reload/restart/sunucu açılışında nginx AÇILMAZ ve BÜTÜN kurum
#    siteleri birden kapanır. Çalışan nginx bozuk ayarı fark etmez; bu yüzden
#    "site açılıyor" kontrolü bu arızayı GÖRMEZ.
#
# 3) CLOUDFLARE ANAHTARI — /root/.secrets/cloudflare.ini
#    Anahtar geçersizse ya da Client IP filtresi (185.33.234.67) yüzünden
#    reddediliyorsa dns-01 doğrulaması, dolayısıyla joker sertifika yenilemesi
#    sessizce ölür. Bunu 21 gün kalana kadar beklemeden yakalar.
#
#    Doğrulama isteği SUNUCUDAN atılır — yani aynı çağrı hem anahtarın
#    geçerliliğini hem de IP filtresinin bu sunucuyu geçirdiğini BİRLİKTE
#    sınar. Başka yerden atılan bir test bunu gösteremez.
#
#    🔴 ANAHTAR LOGA/ÇIKTIYA/PING GÖVDESİNE ASLA YAZILMAZ. Üç koruma:
#      a) Anahtar değişkenden curl'ün ARGÜMANINA geçmez (argv `ps` ile
#         görülebilir). Geçici bir curl ayar dosyasına yazılır; dosya
#         `mktemp -d` (izin 700) içinde, `umask 077` ile (izin 600) açılır ve
#         script biterken silinir (trap).
#      b) Cloudflare yanıtı OLDUĞU GİBİ basılmaz; yalnız errors[].code ve
#         errors[].message alanları çıkarılıp 160 karaktere kırpılır.
#      c) Anahtarın biçimi önce sınanır (yalnız harf/rakam/_/-). Bu hem
#         bozuk dosyayı yakalar hem de ayar dosyasına tırnak kaçışı sokacak
#         bir değerin yazılmasını engeller.
#
# ---------------------------------------------------------------------------
# ALARM YOLU (Healthchecks.io)
# ---------------------------------------------------------------------------
#   Adres REPODA DURMAZ (adresi bilen sahte "başarılı" ping atıp alarmı
#   susturabilir). Sunucuda /root/healthchecks.env (sahibi root, izin 600):
#       HC_URL_NOBETCI=https://hc-ping.com/<uuid>
#   Dosya SOURCE EDİLMEZ, satır ayrıştırılır (backup-db.sh ile aynı gerekçe:
#   env dosyasını "source" etmek kod çalıştırmaktır).
#   Yol HEALTHCHECKS_ENV ile, adres HC_URL_NOBETCI ortam değişkeniyle
#   geçersiz kılınabilir (elle test).
#
#   başarı → ping (gövde: özet satırı)
#   hata   → ping /fail (gövde: özet + sebep) + çıkış kodu 1
#
# 🔴 backup-db.sh'TEN BİLEREK AYRILAN İKİ NOKTA:
#
#   (1) PING ADRESİ YOKSA SESSİZCE GEÇİLMEZ — durum=HATA, çıkış kodu 1.
#       backup-db.sh'te adres yoksa yedek yine de geçerlidir (yedeğin değeri
#       ping'den bağımsız). Nöbetçinin ÜRÜNÜ ping'in kendisidir: haber
#       veremeyen nöbetçi nöbet tutmuyordur. Sessizce "OK" demek, tam olarak
#       bu script'in var oluş sebebi olan kusurun kendisi olurdu.
#       Bu durumda /fail de atılamaz (adres yok); sinyal cron log'u + çıkış
#       kodu + 25 saat sonra Healthchecks'in "ping gelmedi" alarmıdır.
#
#   (2) İLK HATADA DURMAZ — üç kontrolün ÜÇÜ de koşar, bulunan bütün
#       sorunlar tek satırda toplanır. Yedek script'i ilk hatada durur (işe
#       devam etmenin anlamı yok); nöbetçide nginx bozukken sertifikanın da
#       bitmek üzere olduğunu AYNI e-postada görmek gerekir.
#
#   KİLİT YOK: script salt okunur, iki koşumun çakışması zararsız. Kilit
#   eklemek yeni bir arıza yüzeyi açardı (kilit dosyası açılamazsa alarm).
#
#   ASKIDA KALMAYA KARŞI: her dış çağrının süre sınırı var (nginx -t için
#   `timeout 30`, curl için --connect-timeout 5 -m 15). Yine de askıda
#   kalırsa ping gitmez → dead-man's switch devreye girer.
#
# ---------------------------------------------------------------------------
# KULLANIM
# ---------------------------------------------------------------------------
#   bash scripts/nobetci.sh
#
# CRON (root, /opt/build'deki kaynak kopyadan — deploy'dan etkilenmez):
#   17 5 * * * /bin/bash /opt/build/sendika-site/scripts/nobetci.sh >> /var/log/nobetci.log 2>&1
#
# AYARLAR (hepsi ortam değişkeniyle geçersiz kılınabilir — test bunu kullanır):
#   LE_DIZIN          /etc/letsencrypt/live
#   CF_INI            /root/.secrets/cloudflare.ini
#   CF_API            https://api.cloudflare.com/client/v4
#   NGINX_BIN         nginx
#   ALARM_GUN         21
#   UYARI_GUN         25
#   HEALTHCHECKS_ENV  /root/healthchecks.env
#   HC_URL_NOBETCI    (adresi doğrudan verir; dosyayı atlar)
#
# LOG: tek satır, stdout'a (cron yönlendirmesi dosyaya yazar). Script
#   kendiliğinden hiçbir log dosyası AÇMAZ — yan etkisizlik kuralı.
#     2026-09-21T05:17:02 durum=OK sertifika=2/2 en_az=89g(buyukdirilis.org.tr) nginx=OK cloudflare=OK uyari=0 sure=3s
#     2026-09-21T05:17:02 durum=HATA sertifika=2/2 en_az=12g(x.org.tr) nginx=BOZUK cloudflare=OK uyari=0 sure=3s sebep="..."
# =============================================================================
set -uo pipefail
# -e YOK: her hata elle yakalanıp özet satırına yazılıyor (sessiz çıkış olmasın).

BASLA=$(date +%s)
umask 077

LE_DIZIN="${LE_DIZIN:-/etc/letsencrypt/live}"
CF_INI="${CF_INI:-/root/.secrets/cloudflare.ini}"
CF_API="${CF_API:-https://api.cloudflare.com/client/v4}"
NGINX_BIN="${NGINX_BIN:-nginx}"
ALARM_GUN="${ALARM_GUN:-21}"
UYARI_GUN="${UYARI_GUN:-25}"
HC_ENV_DOSYASI="${HEALTHCHECKS_ENV:-/root/healthchecks.env}"

GECICI=$(mktemp -d) || { echo "HATA: geçici dizin açılamadı" >&2; exit 1; }
trap 'rm -rf "$GECICI"' EXIT

# --- Bulgu toplayıcılar -------------------------------------------------------
# Dizi yerine " | " ile birleştirilmiş düz metin: tek satırlık log biçimiyle ve
# ping gövdesiyle birebir aynı, `set -u` altında boş dizi tuzağı yok.
ALARMLAR=""
UYARILAR=""
ALARM_SAYI=0
UYARI_SAYI=0

alarm() {
  ALARMLAR="${ALARMLAR}${ALARMLAR:+ | }$*"
  ALARM_SAYI=$((ALARM_SAYI + 1))
}
uyar() {
  UYARILAR="${UYARILAR}${UYARILAR:+ | }$*"
  UYARI_SAYI=$((UYARI_SAYI + 1))
}

# Log satırını ve ping gövdesini tek satırda tutar: yeni satır → boşluk,
# çift tırnak → tek tırnak (sebep="..." alanını bozmasın).
tek_satir() {
  tr '\n' ' ' | tr '"' "'" | tr -s ' ' | sed 's/^ *//; s/ *$//'
}

log() {
  echo "$(date +%Y-%m-%dT%H:%M:%S) $*"
}

# --- Ping adresi --------------------------------------------------------------
HC_URL=""
HC_SORUN=""

hc_yukle() {
  local ham="" kaynak="" izin
  if [ -n "${HC_URL_NOBETCI:-}" ]; then
    ham="$HC_URL_NOBETCI"
    kaynak="ortam değişkeni HC_URL_NOBETCI"
  elif [ -r "$HC_ENV_DOSYASI" ]; then
    izin=$(stat -c %a "$HC_ENV_DOSYASI" 2>/dev/null || echo "?")
    case "$izin" in
      600|400) ;;
      *) uyar "$HC_ENV_DOSYASI izni $izin — 600 olmalı (ping adresi gizli sayılır): chmod 600 $HC_ENV_DOSYASI" ;;
    esac
    # source ETME: yalnız "HC_URL_NOBETCI=..." satırını oku, sonuncusu kazanır.
    ham=$(sed -n 's/^[[:space:]]*HC_URL_NOBETCI[[:space:]]*=[[:space:]]*//p' "$HC_ENV_DOSYASI" | tail -n 1)
    ham="${ham%$'\r'}"
    ham="${ham%%[[:space:]]*}"
    ham="${ham#\"}"; ham="${ham%\"}"
    ham="${ham#\'}"; ham="${ham%\'}"
    kaynak="$HC_ENV_DOSYASI → HC_URL_NOBETCI"
  else
    HC_SORUN="ping adresi dosyası okunamadı ($HC_ENV_DOSYASI) — nöbetçi haber veremez"
    return 0
  fi

  case "$ham" in
    "")        HC_SORUN="ping adresi boş ($kaynak) — nöbetçi haber veremez"; return 0 ;;
    https://*) ;;
    *)         HC_SORUN="ping adresi https:// ile başlamıyor ($kaynak) — nöbetçi haber veremez"; return 0 ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    HC_SORUN="curl kurulu değil — nöbetçi ne ping atabilir ne Cloudflare anahtarını sınayabilir"
    return 0
  fi

  HC_URL="${ham%/}"
}

# hc_ping <son-ek: "" | /fail> <gövde>
hc_ping() {
  [ -n "$HC_URL" ] || return 0
  local sonek="$1" govde="$2" cikti="$GECICI/hc-hata"
  if curl -fsS --connect-timeout 5 -m 10 --retry 2 --retry-delay 2 \
       -H 'Content-Type: text/plain; charset=utf-8' \
       --data-raw "$govde" -o /dev/null "$HC_URL$sonek" 2>"$cikti"; then
    return 0
  fi
  # Ping gönderilemedi: bunu SESSİZ geçmiyoruz — stdout'a (cron log'una) yazılır.
  # Sonucu değiştirmez; zaten ping gitmediği için dead-man's switch çalışacak.
  log "UYARI: ping GÖNDERİLEMEDİ${sonek:+ ($sonek)} — $(tail -n 1 "$cikti" 2>/dev/null | tek_satir)"
  return 0
}

# --- 1) Sertifika süresi ------------------------------------------------------
SERT_OZET="?"
EN_AZ_GUN=""
EN_AZ_AD=""

sertifika_kontrol() {
  local toplam=0 okunan=0 dizin ad cert ham son_ts simdi kalan
  if [ ! -d "$LE_DIZIN" ]; then
    alarm "sertifika dizini yok: $LE_DIZIN — certbot kurulu değil ya da yol değişmiş"
    SERT_OZET="dizin-yok"
    return
  fi

  simdi=$(date +%s)
  for dizin in "$LE_DIZIN"/*/; do
    [ -d "$dizin" ] || continue
    ad=$(basename "$dizin")
    toplam=$((toplam + 1))
    cert="${dizin%/}/cert.pem"

    # 🔴 Kırık symlink sessizce atlanmaz: live/<ad>/cert.pem daima bir
    # bağlantıdır; archive/ tarafı silinmişse sertifika "yok" demektir.
    if [ ! -r "$cert" ]; then
      alarm "$ad: cert.pem okunamıyor ($cert) — kırık bağlantı ya da izin sorunu"
      continue
    fi

    ham=$(openssl x509 -in "$cert" -noout -enddate 2>"$GECICI/ossl-hata")
    if [ $? -ne 0 ] || [ -z "$ham" ]; then
      alarm "$ad: sertifika okunamadı (openssl): $(tek_satir < "$GECICI/ossl-hata" | cut -c1-120)"
      continue
    fi

    # "notAfter=Dec 19 12:00:00 2026 GMT" → tarih kısmı
    ham="${ham#notAfter=}"
    son_ts=$(date -d "$ham" +%s 2>/dev/null)
    case "$son_ts" in
      ''|*[!0-9]*)
        alarm "$ad: bitiş tarihi çözümlenemedi ('$ham')"
        continue
        ;;
    esac

    okunan=$((okunan + 1))
    kalan=$(( (son_ts - simdi) / 86400 ))

    if [ -z "$EN_AZ_GUN" ] || [ "$kalan" -lt "$EN_AZ_GUN" ]; then
      EN_AZ_GUN="$kalan"
      EN_AZ_AD="$ad"
    fi

    if [ "$kalan" -lt 0 ]; then
      alarm "$ad: sertifika $(( -kalan )) gün ÖNCE doldu — site HTTPS'te açılmıyor olabilir"
    elif [ "$kalan" -lt "$ALARM_GUN" ]; then
      alarm "$ad: sertifikaya $kalan gün kaldı (alarm eşiği $ALARM_GUN) — certbot 30 günde yenilemeliydi, yenilemiyor: 'systemctl status certbot.timer' ve 'certbot renew --dry-run' ile bak"
    elif [ "$kalan" -lt "$UYARI_GUN" ]; then
      uyar "$ad: sertifikaya $kalan gün kaldı (uyarı eşiği $UYARI_GUN) — yenileme penceresi açıldı ama henüz yenilenmedi"
    fi
  done

  if [ "$toplam" = 0 ]; then
    alarm "$LE_DIZIN altında hiç sertifika yok — certbot hiç sertifika almamış ya da yol yanlış"
    SERT_OZET="0/0"
    return
  fi

  SERT_OZET="$okunan/$toplam"
}

# --- 2) Nginx ayarı -----------------------------------------------------------
NGINX_OZET="?"

nginx_kontrol() {
  local cikti="$GECICI/nginx-cikti" kod satir
  if ! command -v "$NGINX_BIN" >/dev/null 2>&1; then
    alarm "nginx bulunamadı ($NGINX_BIN) — ayar sınanamıyor"
    NGINX_OZET="yok"
    return
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout 30 "$NGINX_BIN" -t >"$cikti" 2>&1
    kod=$?
  else
    "$NGINX_BIN" -t >"$cikti" 2>&1
    kod=$?
  fi

  if [ "$kod" = 124 ]; then
    alarm "nginx -t 30 saniyede bitmedi (askıda) — ayar sınanamadı"
    NGINX_OZET="ASKIDA"
    return
  fi

  if [ "$kod" != 0 ]; then
    # nginx hatayı [emerg] satırında dosya+satır numarasıyla söyler; e-postada
    # asıl işe yarayan o satırdır. Yoksa son satıra düşülür.
    satir=$(grep -m 1 -E '\[(emerg|alert|crit)\]' "$cikti" 2>/dev/null | tek_satir)
    [ -n "$satir" ] || satir=$(tail -n 1 "$cikti" 2>/dev/null | tek_satir)
    alarm "nginx ayarı BOZUK (nginx -t çıkış $kod): $(printf '%s' "$satir" | cut -c1-200) — bu hâlde nginx yeniden başlatılırsa BÜTÜN kurum siteleri açılmaz"
    NGINX_OZET="BOZUK"
    return
  fi

  NGINX_OZET="OK"
}

# --- 3) Cloudflare anahtarı ---------------------------------------------------
CF_OZET="?"

cloudflare_kontrol() {
  local izin token ayar kod curl_kod cf_hata durum

  if [ ! -r "$CF_INI" ]; then
    alarm "cloudflare anahtar dosyası okunamıyor ($CF_INI) — joker sertifika yenilemesi bu dosyaya bağlı"
    CF_OZET="dosya-yok"
    return
  fi

  # İzin: certbot gevşek izinli dosyayla ÇALIŞIR (yalnız uyarır), yani yenileme
  # risk altında değil → alarm değil UYARI. backup-db.sh'teki ayrımın aynısı:
  # işlevi bozan şey alarm (.pgpass), yalnız hijyen olan şey uyarı.
  izin=$(stat -c %a "$CF_INI" 2>/dev/null || echo "?")
  case "$izin" in
    600|400) ;;
    *) uyar "$CF_INI izni $izin — 600 olmalı (API anahtarı dosyada açık duruyor): chmod 600 $CF_INI" ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    alarm "curl kurulu değil — cloudflare anahtarı sınanamıyor"
    CF_OZET="curl-yok"
    return
  fi

  # 🔴 Değer HİÇBİR ZAMAN yazdırılmaz. Yalnız "dns_cloudflare_api_token" satırı
  # okunur; yorum satırları (#) ve diğer alanlar dışarıda kalır.
  token=$(sed -n 's/^[[:space:]]*dns_cloudflare_api_token[[:space:]]*=[[:space:]]*//p' "$CF_INI" | tail -n 1)
  token="${token%$'\r'}"
  token="${token%%[[:space:]]*}"
  token="${token#\"}"; token="${token%\"}"
  token="${token#\'}"; token="${token%\'}"

  if [ -z "$token" ]; then
    # Eski biçim (global API anahtarı) ayrı ve NET bir mesaj hak ediyor:
    # sessizce "anahtar yok" demek yanıltıcı olurdu.
    if grep -Eq '^[[:space:]]*dns_cloudflare_api_key[[:space:]]*=' "$CF_INI" 2>/dev/null; then
      alarm "$CF_INI global API anahtarı biçiminde (dns_cloudflare_api_key) — bu nöbetçi yalnız API TOKEN biçimini (dns_cloudflare_api_token) doğrular; IP filtresi zaten yalnız token'larda vardır"
    else
      alarm "$CF_INI içinde dns_cloudflare_api_token satırı yok — dosya bozulmuş ya da boş"
    fi
    CF_OZET="anahtar-yok"
    return
  fi

  # Biçim kontrolü iki iş görür: (a) bozuk/kırpılmış anahtarı ağ çağrısına
  # gerek kalmadan yakalar, (b) aşağıdaki curl ayar dosyasına tırnak kaçışı
  # sokabilecek bir değerin yazılmasını engeller.
  case "$token" in
    *[!A-Za-z0-9_-]*)
      alarm "cloudflare anahtarı beklenen biçimde değil (harf/rakam/_/- dışında karakter var) — dosya bozulmuş olabilir"
      CF_OZET="bicim-bozuk"
      return
      ;;
  esac
  if [ "${#token}" -lt 20 ]; then
    alarm "cloudflare anahtarı beklenenden kısa — kırpılmış olabilir"
    CF_OZET="bicim-bozuk"
    return
  fi

  # 🔴 Anahtar curl'ün ARGÜMANINA geçmez (argv `ps` ile görülebilir).
  # mktemp -d izni 700 + umask 077 → bu dosya 600. trap ile siliniyor.
  ayar="$GECICI/cf.conf"
  printf 'header = "Authorization: Bearer %s"\n' "$token" > "$ayar"
  token=""

  kod=$(curl -sS --connect-timeout 5 -m 15 --retry 2 --retry-delay 3 \
    -o "$GECICI/cf.json" -w '%{http_code}' \
    --config "$ayar" "$CF_API/user/tokens/verify" 2>"$GECICI/cf-hata")
  curl_kod=$?
  rm -f "$ayar"

  if [ "$curl_kod" != 0 ]; then
    # "Ölçemedik" ile "bozuk" farklı şeyler — sebep metni bunu açıkça söylesin
    # ki e-posta geldiğinde yanlış yere koşulmasın.
    alarm "cloudflare API'sine ULAŞILAMADI (curl $curl_kod): $(tek_satir < "$GECICI/cf-hata" | cut -c1-120) — anahtarın bozuk olduğu ANLAMINA GELMEZ, ağ/DNS sorunu olabilir"
    CF_OZET="ULASILAMADI"
    return
  fi

  if grep -q '"success":true' "$GECICI/cf.json" 2>/dev/null; then
    durum=$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([a-z-]*\)".*/\1/p' "$GECICI/cf.json" | head -n 1)
    case "$durum" in
      active)
        CF_OZET="OK"
        ;;
      "")
        # success:true geldi ama durum alanı okunamadı. Anahtar çalışıyor
        # (uç nokta geçersiz anahtara success:true DÖNMEZ); yanıt biçimi
        # değişmiş olabilir. Sahte alarm üretmeyip uyarı bırakıyoruz —
        # sessiz de geçmiyoruz.
        uyar "cloudflare yanıtında durum alanı okunamadı (yanıt biçimi değişmiş olabilir) — anahtar doğrulandı sayıldı"
        CF_OZET="OK?"
        ;;
      *)
        alarm "cloudflare anahtarı AKTİF DEĞİL (durum=$durum) — panelden anahtarı etkinleştir ya da yenisini üret"
        CF_OZET="PASIF"
        ;;
    esac
    return
  fi

  # 🔴 Yanıt olduğu gibi basılmaz: yalnız errors[].code + errors[].message.
  cf_hata=$(sed -n 's/.*"errors":\[{"code":\([0-9]*\),"message":"\([^"]*\)".*/kod \1: \2/p' "$GECICI/cf.json" | head -n 1 | cut -c1-160)
  alarm "cloudflare anahtarı REDDEDİLDİ (HTTP ${kod:-?}${cf_hata:+, $cf_hata}) — anahtar silinmiş/süresi dolmuş olabilir ya da Client IP filtresi bu sunucuyu (185.33.234.67) geçirmiyor; joker sertifika yenilemesi bu hâlde SESSİZCE ölür"
  CF_OZET="REDDEDILDI"
}

# =============================================================================
# Koşum
# =============================================================================
hc_yukle

# Üçü de koşar; ilk hatada durulmaz (başlıktaki gerekçe).
sertifika_kontrol
nginx_kontrol
cloudflare_kontrol

# Ping adresi sorunu EN SON alarm olarak eklenir: önce gerçek bulgular
# toplansın ki adres olmasa bile cron log'unda ne bulunduğu görünsün.
if [ -n "$HC_SORUN" ]; then
  alarm "$HC_SORUN"
fi

SURE=$(( $(date +%s) - BASLA ))
EN_AZ="${EN_AZ_GUN:-?}g(${EN_AZ_AD:-yok})"
OZET="sertifika=$SERT_OZET en_az=$EN_AZ nginx=$NGINX_OZET cloudflare=$CF_OZET uyari=$UYARI_SAYI sure=${SURE}s"

if [ "$ALARM_SAYI" -gt 0 ]; then
  SATIR="durum=HATA $OZET sebep=\"$(printf '%s' "$ALARMLAR" | tek_satir)\""
  [ "$UYARI_SAYI" -gt 0 ] && SATIR="$SATIR uyarilar=\"$(printf '%s' "$UYARILAR" | tek_satir)\""
  log "$SATIR"
  hc_ping "/fail" "$SATIR"
  exit 1
fi

SATIR="durum=OK $OZET"
[ "$UYARI_SAYI" -gt 0 ] && SATIR="$SATIR uyarilar=\"$(printf '%s' "$UYARILAR" | tek_satir)\""
log "$SATIR"
hc_ping "" "$SATIR"
exit 0
