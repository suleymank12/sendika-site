#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — Supabase veritabanının gece yedeği (custom format)
# =============================================================================
#
# NE ALIR: public + auth + storage şemaları — şema + VERİ + ACL — tek dosya:
#   <dizin>/yedek-YYYY-AA-GG_SSDDss.dump        (pg_dump --format=custom)
#
# NEDEN BU BİÇİM (11 Eylül 2026 ölçümü — NOTE.md "YEDEKTEN GERİ YÜKLEME"):
#   Eski komut (/usr/local/bin/supabase-yedek.sh: pg_dump --no-owner --no-acl,
#   plain, gzip) TAM döküm alıyordu: auth, storage, realtime, vault, graphql...
#   hepsi içinde → yeni projede her nesne çakışır; plain olduğu için seçici
#   yükleme yok; GRANT/REVOKE sayısı 0 → 022'nin "REVOKE EXECUTE ON
#   is_super_admin FROM anon" satırı yok, şema o yedekten kurulursa K1 açığı
#   geri gelir; dosya psql meta-komutuyla (\unrestrict) bitiyor.
#
#   --format=custom      seçici geri yükleme (pg_restore -n / -t / --data-only),
#                        pg_restore -l ile içerik listesi. Tablo verisi gzip ile
#                        SIKIŞTIRILIR — custom formatın varsayılanı (PostgreSQL
#                        belgesi, pg_dump -Z). Ayrı gzip GEREKMEZ; doğrulama
#                        satırı arşivin "Compression" değerini log'a yazar.
#   --schema=public      uygulamanın tabloları, fonksiyonları, RLS, policy'ler
#   --schema=auth        kullanıcılar + şifre hash'leri (auth.users, identities)
#   --schema=storage     bucket ve nesne bilgileri + storage.objects policy'leri
#                        (realtime, vault, graphql... projeye özgü, taşınmaz →
#                        bilerek ALINMAZ)
#   ACL DAHİL            --no-acl YOK: GRANT/REVOKE'lar yedekte kalsın.
#   --no-owner           arşiv biçiminde pg_dump bunu YOK SAYAR (sahiplik
#                        bilgisi arşive hep yazılır); geri yüklemede
#                        pg_restore --no-owner verilmeli. Niyeti belgelemek
#                        için duruyor.
#   --no-publications / --no-subscriptions / --no-security-labels
#                        her Supabase projesinde zaten olan ya da hedefte
#                        çatışan nesneler (dump-baseline.sh ile aynı gerekçe)
#
# ŞİFRE: script'te YOK — libpq şifre dosyasından okur (varsayılan
#   /root/.pgpass, PGPASSFILE ile değişir). Tek satır:
#     aws-0-eu-west-1.pooler.supabase.com:5432:postgres:postgres.<ref>:<şifre>
#   (şifrede ':' ya da '\' varsa önüne '\' konur). İzin 600 OLMALI — libpq
#   gevşek izinli dosyayı YOK SAYAR; script bunu baştan kontrol eder.
#   Neden env dosyası değil: PGPASSWORD ortam değişkeni PostgreSQL belgesinde
#   önerilmiyor (bazı sistemlerde süreç ortamı görülebilir); .pgpass'ı
#   pg_dump/pg_restore/psql kendiliğinden okur (tatbikatta da aynı dosya),
#   izin denetimi libpq'da yerleşik, env dosyasını "source" etmek gibi kod
#   çalıştırma riski yok. PGPASSWORD bu yüzden bilerek unset edilir.
#
# BAĞLANTI: PGHOST/PGPORT/PGUSER/PGDATABASE/PGSSLMODE ortamdan değiştirilebilir;
#   verilmezse canlı proje (session pooler, 5432 — 6543 transaction mode'dur,
#   pg_dump orada çalışmaz).
#
# KULLANIM:
#   bash scripts/backup-db.sh                     # → /var/backups/supabase
#   bash scripts/backup-db.sh /tmp/deneme-yedek   # başka dizin
#
# CRON (root, /opt/build'deki kaynak kopyadan — deploy'dan etkilenmez):
#   0 4 * * * /bin/bash /opt/build/sendika-site/scripts/backup-db.sh >> /var/log/supabase-yedek.log 2>&1
#
# KENDİ DOĞRULAMASI — biri düşerse log satırı "durum=HATA", çıkış kodu 1:
#   1) şifre dosyası var ve izni 600/400; pg_dump / pg_restore / psql kurulu
#   2) pg_dump çıkış kodu 0 (dosya önce .part'a yazılır, bitince rename —
#      nihai adda hiçbir zaman yarım dosya olmaz)
#   3) pg_restore -l: Format CUSTOM; auth.users, auth.identities,
#      storage.buckets, storage.objects TABLE DATA girdileri var; public
#      TABLE DATA sayısı = canlıdaki public tablo sayısı; is_super_admin ACL
#      girdisi var (K1 — ACL'lerin gerçekten alındığının kanıtı)
#   Doğrulama düşse de dosya SİLİNMEZ (o gecenin tek yedeği olabilir).
#
# BAŞARI SİNYALİ (dead-man's switch, 12 Eylül 2026 — NOTE.md "✅ KAPATILDI —
#   Yedek başarısızlığı bildirimi"): koşum BAŞARIYLA biterse (tüm doğrulamalar
#   geçti) Healthchecks.io'ya ping atılır; 25 saat (1 gün + 1 saat grace) ping
#   gelmezse Healthchecks e-posta atar. "Hata olunca bildir"den güçlü: cron hiç
#   çalışmazsa hata da oluşmaz ama ping de gelmez.
#
#   HATADA: /fail uç noktasına ping (hemen alarm + sebep e-postada görünür).
#   Gerekçe: ping ATMAMAK zaten 25 saat sonra alarm demektir; /fail aynı alarmı
#   HEMEN ve SEBEBİYLE verir. TEK İSTİSNA kilit çakışması — işi başka bir koşum
#   yapıyor ve o başarı ping'ini atacak; /fail sahte alarm olurdu.
#
#   ADRES REPODA DURMAZ (adresi bilen sahte "başarılı" ping atıp alarmı
#   susturabilir). Sunucuda /root/healthchecks.env (sahibi root, izin 600):
#       HC_URL_DB=https://hc-ping.com/<uuid>
#   Dosya SOURCE EDİLMEZ, satır ayrıştırılır (.pgpass ile aynı gerekçe: env
#   dosyasını "source" etmek kod çalıştırmaktır). Yol HEALTHCHECKS_ENV ile,
#   adres HC_URL_DB ortam değişkeniyle geçersiz kılınabilir (elle test).
#
#   Adres yoksa / curl yoksa / ping düşerse: yalnız cron log'una uyarı satırı;
#   yedek geçerli sayılır, çıkış kodu DEĞİŞMEZ. Ping en fazla ~35 sn sürer
#   (3 deneme × 10 sn + aralar) ve yedek bittikten SONRA atılır.
#
# SAKLAMA: SAKLAMA_GUN (14) günden eski yedek-*.dump ve ESKİ biçimdeki
#   yedek-*.sql.gz dosyaları silinir — YALNIZ o gecenin yedeği doğrulamayı
#   geçtiyse. Yedekler üst üste başarısız olursa eski sağlam yedekler silinmez.
#
# LOG: <dizin>/yedek.log'a tek satır (storage yedeğiyle aynı desen):
#   2026-09-12T04:00:14 durum=OK dosya=yedek-2026-09-12_040001.dump boyut=1.4M sure=11s public=20/20 kullanici=14 sikistirma=gzip silinen=1
#   Ping notları bu dosyaya YAZILMAZ — yedek.log'un "koşum başına tek satır"
#   biçimi korunsun diye yalnız stdout'a (cron log'u) gider.
# =============================================================================
set -uo pipefail
# -e YOK: her hata elle yakalanıp log satırına yazılıyor (sessiz çıkış olmasın).

DIZIN="${1:-/var/backups/supabase}"
SAKLAMA_GUN="${SAKLAMA_GUN:-14}"

export PGHOST="${PGHOST:-aws-0-eu-west-1.pooler.supabase.com}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres.jqwmnawzehyvpwrtdvku}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGSSLMODE="${PGSSLMODE:-require}"
export PGPASSFILE="${PGPASSFILE:-${HOME:-/root}/.pgpass}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"
unset PGPASSWORD

# Yedekte şifre hash'leri ve kişisel veri var — dosyalar yalnız sahibine açık.
umask 077

BASLA=$(date +%s)
ZAMAN=$(date +%Y-%m-%d_%H%M%S)
DOSYA="$DIZIN/yedek-$ZAMAN.dump"
LOG="$DIZIN/yedek.log"
GECICI=$(mktemp -d) || { echo "HATA: geçici dizin açılamadı" >&2; exit 1; }
trap 'rm -rf "$GECICI"' EXIT
HATA="$GECICI/stderr"

log() {
  local satir
  satir="$(date +%Y-%m-%dT%H:%M:%S) $*"
  echo "$satir"
  if [ -d "$DIZIN" ]; then echo "$satir" >> "$LOG"; fi
}

son_hata() {
  tail -n 3 "$HATA" 2>/dev/null | tr '\n' ' ' | tr '"' "'"
}

# --- Başarı sinyali (Healthchecks.io) ---------------------------------------
# Ayrıntı ve gerekçeler script başlığında. Buradaki hiçbir şey yedeğin
# sonucunu değiştirmez: adres yoksa, curl yoksa, ping düşerse sessizce geçilir.
HC_ENV_DOSYASI="${HEALTHCHECKS_ENV:-/root/healthchecks.env}"
HC_URL=""
HC_FAIL_GONDER=1   # kilit çakışmasında 0 yapılır (bkz. başlık)

# Ping notları yalnız stdout'a → cron log'u. yedek.log'un tek satırlık biçimi
# bozulmasın (başlıktaki LOG bölümü).
hc_not() {
  echo "$(date +%Y-%m-%dT%H:%M:%S) healthchecks: $*"
}

hc_yukle() {
  local ham="" kaynak="" izin
  if [ -n "${HC_URL_DB:-}" ]; then
    ham="$HC_URL_DB"
    kaynak="ortam değişkeni HC_URL_DB"
  elif [ -f "$HC_ENV_DOSYASI" ]; then
    izin=$(stat -c %a "$HC_ENV_DOSYASI" 2>/dev/null || echo "?")
    case "$izin" in
      600|400) ;;
      *) hc_not "UYARI: $HC_ENV_DOSYASI izni $izin — 600 olmalı (ping adresi gizli sayılır)" ;;
    esac
    # source ETME: yalnız "HC_URL_DB=..." satırını oku, sonuncusu kazanır.
    ham=$(sed -n 's/^[[:space:]]*HC_URL_DB[[:space:]]*=[[:space:]]*//p' "$HC_ENV_DOSYASI" | tail -n 1)
    ham="${ham%$'\r'}"
    ham="${ham%%[[:space:]]*}"
    ham="${ham#\"}"; ham="${ham%\"}"
    ham="${ham#\'}"; ham="${ham%\'}"
    kaynak="$HC_ENV_DOSYASI → HC_URL_DB"
  else
    hc_not "ping adresi yok ($HC_ENV_DOSYASI okunamadı) — dead-man's switch DEVRE DIŞI"
    return 0
  fi

  case "$ham" in
    "")        hc_not "ping adresi yok ($kaynak) — dead-man's switch DEVRE DIŞI"; return 0 ;;
    https://*) ;;
    *)         hc_not "UYARI: ping adresi https:// ile başlamıyor ($kaynak) — YOK SAYILDI"; return 0 ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    hc_not "UYARI: curl yok — ping atılamıyor ($kaynak)"
    return 0
  fi

  HC_URL="${ham%/}"
}

# hc_ping <son-ek: "" | /fail> <gövde>
hc_ping() {
  [ -n "$HC_URL" ] || return 0
  local sonek="$1" govde="$2" cikti="$GECICI/hc-hata"
  # -m: tek deneme üst sınırı. --retry: tek ağ hıçkırığı sahte alarma dönmesin.
  if curl -fsS --connect-timeout 5 -m 10 --retry 2 --retry-delay 2 \
       -H 'Content-Type: text/plain; charset=utf-8' \
       --data-raw "$govde" -o /dev/null "$HC_URL$sonek" 2>"$cikti"; then
    hc_not "ping gönderildi${sonek:+ ($sonek)}"
  else
    hc_not "UYARI: ping GÖNDERİLEMEDİ${sonek:+ ($sonek)} — yedeğin sonucu bundan etkilenmez: $(tail -n 1 "$cikti" 2>/dev/null | tr -d '\n')"
  fi
  return 0
}

fail() {
  log "durum=HATA sebep=\"$*\" sure=$(( $(date +%s) - BASLA ))s"
  [ "$HC_FAIL_GONDER" = 1 ] && hc_ping "/fail" "durum=HATA sebep=$*"
  exit 1
}

hc_yukle

# --- 1) Ön koşullar ----------------------------------------------------------
mkdir -p "$DIZIN" 2>/dev/null || { echo "HATA: dizin oluşturulamadı: $DIZIN" >&2; exit 1; }

for arac in pg_dump pg_restore psql; do
  command -v "$arac" >/dev/null 2>&1 || fail "$arac bulunamadı"
done

[ -f "$PGPASSFILE" ] || fail "şifre dosyası yok: $PGPASSFILE (bkz. script başlığı)"
IZIN=$(stat -c %a "$PGPASSFILE" 2>/dev/null) || fail "şifre dosyasının izni okunamadı: $PGPASSFILE"
case "$IZIN" in
  600|400) ;;
  *) fail "şifre dosyasının izni $IZIN — 600 olmalı (libpq aksi halde dosyayı yok sayar): chmod 600 $PGPASSFILE" ;;
esac

# Aynı anda iki koşum (elle + cron) aynı dosyaya yazmasın.
if command -v flock >/dev/null 2>&1; then
  KILIT="${KILIT:-${TMPDIR:-/tmp}/sendika-backup-db.lock}"
  exec 9>"$KILIT" || fail "kilit dosyası açılamadı: $KILIT"
  # /fail YOK: işi süren diğer koşum yapıyor, başarı ping'ini o atacak.
  flock -n 9 || { HC_FAIL_GONDER=0; fail "başka bir yedek koşumu sürüyor"; }
fi

# --- 2) Canlıdaki beklenen değerler (doğrulamada TOC ile karşılaştırılır) ----
PUBLIC_BEKLENEN=$(psql -X -Atq -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" 2>"$HATA") \
  || fail "veritabanına bağlanılamadı: $(son_hata)"
case "$PUBLIC_BEKLENEN" in
  ''|*[!0-9]*) fail "public tablo sayısı okunamadı: '$PUBLIC_BEKLENEN'" ;;
esac
KULLANICI=$(psql -X -Atq -c "SELECT count(*) FROM auth.users" 2>/dev/null || echo "?")

# --- 3) Döküm ---------------------------------------------------------------
if ! pg_dump \
    --format=custom \
    --schema=public \
    --schema=auth \
    --schema=storage \
    --no-owner \
    --no-publications \
    --no-subscriptions \
    --no-security-labels \
    --file="$DOSYA.part" 2>"$HATA"; then
  rm -f "$DOSYA.part"
  fail "pg_dump başarısız: $(son_hata)"
fi
mv -f "$DOSYA.part" "$DOSYA" || fail "dosya adlandırılamadı: $DOSYA"

# --- 4) Doğrulama (pg_restore -l) -------------------------------------------
TOC="$GECICI/toc"
pg_restore --list "$DOSYA" > "$TOC" 2>"$HATA" || fail "pg_restore -l arşivi okuyamadı: $(son_hata) (dosya: $DOSYA)"

grep -Eq '^;[[:space:]]*Format: CUSTOM' "$TOC" || fail "arşiv biçimi CUSTOM değil (dosya: $DOSYA)"
SIKISTIRMA=$(sed -n 's/^;[[:space:]]*Compression: *//p' "$TOC" | head -n 1)

# TOC satırı: "<id>; <oid> <oid> TABLE DATA <şema> <tablo> <sahip>"
GIRDILER="$GECICI/girdiler"
grep -v '^;' "$TOC" > "$GIRDILER" || true
for tablo in "auth users" "auth identities" "storage buckets" "storage objects"; do
  grep -Eq " TABLE DATA $tablo( |$)" "$GIRDILER" || fail "yedekte $tablo verisi yok (dosya: $DOSYA)"
done

PUBLIC_VERI=$(grep -Ec ' TABLE DATA public ' "$GIRDILER" || true)
[ "$PUBLIC_VERI" = "$PUBLIC_BEKLENEN" ] \
  || fail "public tablo verisi $PUBLIC_VERI, canlıda $PUBLIC_BEKLENEN tablo var (dosya: $DOSYA)"

grep -Eq ' ACL public FUNCTION is_super_admin\(' "$GIRDILER" \
  || fail "is_super_admin ACL girdisi yok — ACL'ler alınmamış (dosya: $DOSYA)"

# --- 5) Saklama — YALNIZ doğrulama geçtiyse ---------------------------------
SILINEN=$(find "$DIZIN" -maxdepth 1 -type f \
  \( -name 'yedek-*.dump' -o -name 'yedek-*.sql.gz' -o -name 'yedek-*.dump.part' \) \
  -mtime +"$SAKLAMA_GUN" -print -delete 2>/dev/null | wc -l | tr -d ' ')

BOYUT=$(du -h "$DOSYA" | cut -f1)
OZET="durum=OK dosya=$(basename "$DOSYA") boyut=$BOYUT sure=$(( $(date +%s) - BASLA ))s public=$PUBLIC_VERI/$PUBLIC_BEKLENEN kullanici=$KULLANICI sikistirma=${SIKISTIRMA:-?} silinen=$SILINEN"
log "$OZET"

# Başarı sinyali EN SON: buraya gelindiyse döküm alındı ve doğrulamanın
# tamamı geçti. Gövde Healthchecks panelinde/e-postasında görünür.
hc_ping "" "$OZET"
exit 0
