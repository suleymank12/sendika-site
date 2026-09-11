#!/usr/bin/env bash
# =============================================================================
# test-backup-db.sh — scripts/backup-db.sh testi (stub pg_dump / pg_restore / psql)
# =============================================================================
# CALISTIRMA (Linux — WSL ya da VPS; chmod 600 gercek olmali):
#   npm run test:backup-db        (Windows'ta npm "bash"i WSL'de calistirir)
#   bash scripts/test-backup-db.sh
#
# BU TEST NEYI DOGRULAR:
#   (a) basarili kosum: exit 0, .dump (izin 600), .part kalmaz, log satiri OK
#   (b) pg_dump bayraklari: custom format, public/auth/storage, --no-owner;
#       --no-acl YOK; sifre argumanda/ortamda YOK (PGPASSWORD unset)
#   (c) dogrulama dusunce exit 1 + log HATA + dosya SILINMEZ: auth.users /
#       storage.objects verisi yok, public sayisi tutmuyor, ACL yok, bicim
#       CUSTOM degil, pg_restore okuyamiyor
#   (d) pg_dump / baglanti hatasi: exit 1, yarim dosya kalmaz
#   (e) saklama: 14 gunden eski .dump VE eski .sql.gz silinir, yenisi ve
#       ilgisiz dosya kalir — YALNIZ dogrulama gectiyse
#   (f) sifre dosyasi yok / izni 644 → exit 1, pg_dump hic cagrilmaz
#   (g) kilit: ayni anda ikinci kosum → exit 1
#
# TOC fiksturu GERCEK pg_restore 17.11 ciktisinin bicimi (11 Eylul 2026'da
# yerel PostgreSQL 17.11'e karsi alinan -Fc dokumunden — NOTE.md). Gercek
# PostgreSQL'e karsi uctan uca kosum da yapildi; bu dosya stub'larla her
# ortamda tekrarlanabilir kismi kilitler.
# =============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/scripts/backup-db.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# --- Ortam kontrolu -----------------------------------------------------------
: > "$T/izin-deneme"
chmod 600 "$T/izin-deneme"
if [ "$(stat -c %a "$T/izin-deneme" 2>/dev/null)" != "600" ]; then
  echo "ORTAM UYGUN DEGIL: bu dosya sisteminde chmod 600 etkisiz (Git Bash / NTFS)."
  echo "Linux'ta calistirin: wsl bash scripts/test-backup-db.sh  (ya da VPS'te)"
  exit 1
fi

PASS=0
FAIL=0
ok() { # ad cikti beklenen
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $1"; echo "          cikti : $2"; echo "          bekle : $3"
  fi
}
has() { # ad dosya desen (grep -E)
  if grep -Eq -- "$3" "$2" 2>/dev/null; then ok "$1" var var; else ok "$1" yok var; fi
}
hasnt() {
  if grep -Eq -- "$3" "$2" 2>/dev/null; then ok "$1" var yok; else ok "$1" yok yok; fi
}

# --- Stub'lar -----------------------------------------------------------------
mkdir -p "$T/bin"
cat > "$T/bin/psql" <<'STUB'
#!/usr/bin/env bash
if [ "${STUB_PSQL_EXIT:-0}" != 0 ]; then
  echo "psql: error: connection to server failed: FATAL: password authentication failed" >&2
  exit 2
fi
case "$*" in
  *pg_tables*) echo "${STUB_PUBLIC:-20}" ;;
  *auth.users*) echo "${STUB_USERS:-7}" ;;
  *) echo "beklenmeyen sorgu: $*" >&2; exit 3 ;;
esac
STUB
cat > "$T/bin/pg_dump" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$STUB_DIR/pg_dump.args"
echo "${PGPASSWORD-UNSET}" > "$STUB_DIR/pg_dump.pgpassword"
out=""
for a in "$@"; do case "$a" in --file=*) out="${a#--file=}" ;; esac; done
echo "PGDMP-sahte-icerik" > "$out"
if [ "${STUB_PGDUMP_EXIT:-0}" != 0 ]; then
  echo "pg_dump: error: query failed: sahte hata" >&2
  exit 1
fi
exit 0
STUB
cat > "$T/bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
if [ "${STUB_RESTORE_EXIT:-0}" != 0 ]; then
  echo "pg_restore: error: input file does not appear to be a valid archive" >&2
  exit 1
fi
cat "$STUB_TOC"
STUB
chmod +x "$T/bin/"*

# TOC fikstuuru — gercek bicim; $1 = cikarilacak satir deseni (grep -v)
PUBLIC_TABLOLAR="announcements board_members branches contact_messages contact_rate_limit content_media gallery_albums gallery_images headlines homepage_section_items homepage_sections menu_items news news_categories pages site_settings sliders super_admins tenant_users tenants"
make_toc() {
  local out="$1" drop="${2:-}" format="${3:-CUSTOM}"
  {
    echo ";"
    echo "; Archive created at 2026-09-12 04:00:01 +03"
    echo ";     dbname: postgres"
    echo ";     TOC Entries: 300"
    echo ";     Compression: gzip"
    echo ";     Dump Version: 1.16-0"
    echo ";     Format: $format"
    echo ";     Dumped from database version: 17.6"
    echo ";     Dumped by pg_dump version: 17.11"
    echo ";"
    echo "; Selected TOC Entries:"
    echo ";"
    echo "6; 2615 16387 SCHEMA - auth supabase_admin"
    echo "229; 1255 16456 FUNCTION public is_super_admin(uuid) postgres"
    echo "3523; 0 0 ACL public FUNCTION is_super_admin(user_id uuid) postgres"
    local n=4000
    echo "$n; 0 16390 TABLE DATA auth users supabase_auth_admin"; n=$((n + 1))
    echo "$n; 0 16397 TABLE DATA auth identities supabase_auth_admin"; n=$((n + 1))
    echo "$n; 0 16407 TABLE DATA storage buckets supabase_storage_admin"; n=$((n + 1))
    echo "$n; 0 16414 TABLE DATA storage objects supabase_storage_admin"; n=$((n + 1))
    for t in $PUBLIC_TABLOLAR; do
      echo "$n; 0 17000 TABLE DATA public $t postgres"; n=$((n + 1))
    done
    echo "3506; 3256 16457 POLICY public news news_read postgres"
  } | if [ -n "$drop" ]; then grep -Ev -- "$drop"; else cat; fi > "$out"
}
make_toc "$T/toc-tam"

printf 'aws-0-eu-west-1.pooler.supabase.com:5432:postgres:postgres.test:gizli\n' > "$T/pgpass"
chmod 600 "$T/pgpass"

# run <dizin> [ENV=deger ...] → cikis kodu; cikti $T/out
run() {
  local dir="$1"; shift
  env PATH="$T/bin:$PATH" PGPASSFILE="$T/pgpass" KILIT="$T/kilit" STUB_DIR="$T" \
    STUB_TOC="$T/toc-tam" PGPASSWORD="kabukta-kalmis-sifre" "$@" \
    bash "$SCRIPT" "$dir" > "$T/out" 2>&1
  echo $?
}

# ---------------------------------------------------------------------------
echo ""
echo "(a) Basarili kosum + (b) bayraklar"
echo ""
D="$T/y-ok"; mkdir -p "$D"
touch -d '20 days ago' "$D/yedek-2026-08-01_0400.sql.gz" "$D/yedek-2026-08-02_040000.dump" "$D/notlar.txt"
touch -d '3 days ago' "$D/yedek-2026-09-08_0400.sql.gz" "$D/yedek-2026-09-09_040000.dump"
ok "cikis kodu 0" "$(run "$D")" 0
DUMP="$(ls "$D"/yedek-*.dump 2>/dev/null | grep -v 2026-09-09 | head -n 1)"
ok "yeni .dump olustu" "$([ -n "$DUMP" ] && [ -f "$DUMP" ] && echo var)" var
ok "dosya izni 600 (sifre hash'leri icerir)" "$(stat -c %a "$DUMP" 2>/dev/null)" 600
ok ".part kalmadi" "$(ls "$D"/*.part 2>/dev/null | wc -l | tr -d ' ')" 0
has "log: durum=OK + public=20/20 + kullanici + sikistirma" "$D/yedek.log" 'durum=OK dosya=yedek-[0-9_-]+\.dump .* public=20/20 kullanici=7 sikistirma=gzip silinen=2$'
has "pg_dump --format=custom" "$T/pg_dump.args" '^--format=custom$'
has "pg_dump --schema=public" "$T/pg_dump.args" '^--schema=public$'
has "pg_dump --schema=auth" "$T/pg_dump.args" '^--schema=auth$'
has "pg_dump --schema=storage" "$T/pg_dump.args" '^--schema=storage$'
has "pg_dump --no-owner" "$T/pg_dump.args" '^--no-owner$'
hasnt "pg_dump --no-acl YOK (ACL'ler yedekte)" "$T/pg_dump.args" 'no-acl|no-privileges|^-x$'
hasnt "sifre argumanda YOK" "$T/pg_dump.args" 'gizli|password|kabukta'
ok "kabuktaki PGPASSWORD pg_dump'a GECMEZ (unset)" "$(cat "$T/pg_dump.pgpassword")" UNSET
echo ""
echo "(e) Saklama"
echo ""
ok "20 gunluk .sql.gz (eski bicim) silindi" "$([ -e "$D/yedek-2026-08-01_0400.sql.gz" ] && echo var || echo yok)" yok
ok "20 gunluk .dump silindi" "$([ -e "$D/yedek-2026-08-02_040000.dump" ] && echo var || echo yok)" yok
ok "3 gunluk .sql.gz kaldi" "$([ -e "$D/yedek-2026-09-08_0400.sql.gz" ] && echo var || echo yok)" var
ok "3 gunluk .dump kaldi" "$([ -e "$D/yedek-2026-09-09_040000.dump" ] && echo var || echo yok)" var
ok "ilgisiz eski dosyaya dokunulmadi" "$([ -e "$D/notlar.txt" ] && echo var || echo yok)" var

# ---------------------------------------------------------------------------
echo ""
echo "(c) Dogrulama dusunce: exit 1, log HATA, dosya SILINMEZ, saklama CALISMAZ"
echo ""
dogrulama_hatasi() { # ad toc-drop beklenen-sebep [ek ENV]
  local ad="$1" drop="$2" sebep="$3"; shift 3
  local dir="$T/y-$RANDOM"; mkdir -p "$dir"
  touch -d '20 days ago' "$dir/yedek-2026-08-01_0400.sql.gz"
  local toc="$T/toc-$RANDOM"
  make_toc "$toc" "$drop"
  ok "$ad → exit 1" "$(run "$dir" STUB_TOC="$toc" "$@")" 1
  has "$ad → log sebebi" "$dir/yedek.log" "durum=HATA sebep=\".*$sebep"
  ok "$ad → dump dosyasi SILINMEDI" "$(ls "$dir"/yedek-*.dump 2>/dev/null | wc -l | tr -d ' ')" 1
  ok "$ad → saklama calismadi (eski yedek duruyor)" "$([ -e "$dir/yedek-2026-08-01_0400.sql.gz" ] && echo var || echo yok)" var
}
dogrulama_hatasi "auth.users verisi yok" ' TABLE DATA auth users ' "auth users verisi yok"
dogrulama_hatasi "storage.objects verisi yok" ' TABLE DATA storage objects ' "storage objects verisi yok"
dogrulama_hatasi "public tablo eksik (19/20)" ' TABLE DATA public tenants ' "public tablo verisi 19, canlıda 20"
dogrulama_hatasi "canlida tablo artmis (20/21)" '^$' "public tablo verisi 20, canlıda 21" STUB_PUBLIC=21
dogrulama_hatasi "is_super_admin ACL yok (--no-acl)" ' ACL public ' "is_super_admin ACL girdisi yok"
{
  dir="$T/y-bicim"; mkdir -p "$dir"
  make_toc "$T/toc-bicim" "" "TAR"
  ok "bicim CUSTOM degil → exit 1" "$(run "$dir" STUB_TOC="$T/toc-bicim")" 1
  has "bicim → log sebebi" "$dir/yedek.log" 'arşiv biçimi CUSTOM değil'
}
{
  dir="$T/y-restore"; mkdir -p "$dir"
  ok "pg_restore okuyamiyor → exit 1" "$(run "$dir" STUB_RESTORE_EXIT=1)" 1
  has "pg_restore → log sebebi" "$dir/yedek.log" 'pg_restore -l arşivi okuyamadı'
}

# ---------------------------------------------------------------------------
echo ""
echo "(d) pg_dump / baglanti hatasi"
echo ""
{
  dir="$T/y-dump"; mkdir -p "$dir"
  touch -d '20 days ago' "$dir/yedek-2026-08-01_0400.sql.gz"
  ok "pg_dump basarisiz → exit 1" "$(run "$dir" STUB_PGDUMP_EXIT=1)" 1
  ok "yarim dosya kalmadi (.dump yok, .part yok)" "$(ls "$dir"/yedek-*.dump "$dir"/*.part 2>/dev/null | wc -l | tr -d ' ')" 0
  has "log: pg_dump hatasi + stderr" "$dir/yedek.log" 'pg_dump başarısız: pg_dump: error: query failed'
  ok "saklama calismadi" "$([ -e "$dir/yedek-2026-08-01_0400.sql.gz" ] && echo var || echo yok)" var
}
{
  dir="$T/y-baglanti"; mkdir -p "$dir"
  rm -f "$T/pg_dump.args"
  ok "baglanti yok → exit 1" "$(run "$dir" STUB_PSQL_EXIT=1)" 1
  ok "pg_dump HIC cagrilmadi" "$([ -e "$T/pg_dump.args" ] && echo cagrildi || echo cagrilmadi)" cagrilmadi
  has "log: baglanti sebebi" "$dir/yedek.log" 'veritabanına bağlanılamadı: .*password authentication failed'
}

# ---------------------------------------------------------------------------
echo ""
echo "(f) Sifre dosyasi"
echo ""
{
  dir="$T/y-pgpass"; mkdir -p "$dir"
  rm -f "$T/pg_dump.args"
  ok "sifre dosyasi yok → exit 1" "$(run "$dir" PGPASSFILE="$T/yok")" 1
  has "log: dosya yok" "$dir/yedek.log" 'şifre dosyası yok'
  cp "$T/pgpass" "$T/pgpass-644"; chmod 644 "$T/pgpass-644"
  ok "izin 644 → exit 1" "$(run "$dir" PGPASSFILE="$T/pgpass-644")" 1
  has "log: izin 644, 600 olmali" "$dir/yedek.log" 'izni 644 — 600 olmalı'
  ok "pg_dump HIC cagrilmadi" "$([ -e "$T/pg_dump.args" ] && echo cagrildi || echo cagrilmadi)" cagrilmadi
  cp "$T/pgpass" "$T/pgpass-400"; chmod 400 "$T/pgpass-400"
  ok "izin 400 de kabul" "$(run "$T/y-400" PGPASSFILE="$T/pgpass-400")" 0
}

# ---------------------------------------------------------------------------
echo ""
echo "(g) Kilit"
echo ""
if command -v flock >/dev/null 2>&1; then
  flock "$T/kilit" sleep 3 &
  KILIT_PID=$!
  sleep 0.5
  dir="$T/y-kilit"; mkdir -p "$dir"
  ok "ayni anda ikinci kosum → exit 1" "$(run "$dir")" 1
  has "log: baska kosum suruyor" "$dir/yedek.log" 'başka bir yedek koşumu sürüyor'
  wait "$KILIT_PID" 2>/dev/null
  ok "kilit birakilinca kosum gecer" "$(run "$dir")" 0
else
  echo "  ATLANDI  flock yok (kilit testi)"
fi

# ---------------------------------------------------------------------------
echo ""
echo "SONUC: $PASS gecti, $FAIL kaldi"
echo ""
[ "$FAIL" -eq 0 ]
