#!/usr/bin/env bash
# =============================================================================
# dump-baseline.sh — canli semanin baseline dokumunu uretir
# =============================================================================
#
# NE URETIR: supabase/migrations/000_baseline.sql adayi, uc parcadan olusur:
#   A) Eklentiler  — canlida hangi semada kuruluysa aynen (uuid-ossp, pgcrypto)
#   B) public sema — pg_dump --schema-only (tablo, index, constraint, RLS,
#                    policy, fonksiyon, trigger, GRANT/REVOKE, COMMENT)
#   C) storage.objects policy'leri — pg_dump bunlari GETIREMEZ (Supabase'de
#      storage semasinin sahibi supabase_storage_admin; semayi dumplamak
#      Supabase'in kendi tablolarini da getirir ve hedefte catisir).
#      Bu yuzden pg_policies'ten DDL yeniden uretilir.
#
# NE URETMEZ: VERI. --schema-only kullanilir; tek satir INSERT/COPY cikmaz.
#   Sifirdan kurulum icin gereken tohum ayri dosyada: 001_seed_default.sql
#
# KULLANIM (VPS'te):
#   export BASELINE_PGURI='postgresql://postgres.<ref>:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
#   bash dump-baseline.sh                              # -> ./000_baseline.sql
#   bash dump-baseline.sh "$BASELINE_PGURI" /tmp/000_baseline.sql
#
# PORT UYARISI: 5432 (session pooler) KULLANIN. 6543 transaction mode'dur,
#   pg_dump orada prepared statement hatasi verir.
# =============================================================================
set -euo pipefail

PGURI="${1:-${BASELINE_PGURI:-}}"
OUT="${2:-000_baseline.sql}"

if [ -z "$PGURI" ]; then
  echo "HATA: baglanti adresi yok." >&2
  echo "  export BASELINE_PGURI='postgresql://postgres.<ref>:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'" >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "HATA: pg_dump bulunamadi." >&2; exit 1; }
command -v psql    >/dev/null || { echo "HATA: psql bulunamadi." >&2; exit 1; }

echo "pg_dump: $(pg_dump --version)"
echo "sunucu : $(psql "$PGURI" -Atc 'SHOW server_version;')"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# -----------------------------------------------------------------------------
# A) Eklentiler — canlida hangi semada kuruluysa AYNI semaya
# -----------------------------------------------------------------------------
# Neden elle: pg_dump -n public secildiginde eklenti nesnelerini guvenilir
# sekilde getirmez. uuid_generate_v4() / gen_random_uuid() varsayilanlari
# eklentinin semasina bagli oldugu icin bu satirlar kaybolursa CREATE TABLE'lar
# "function does not exist" ile patlar.
psql "$PGURI" -Atq -o "$TMP/ext.sql" <<'SQL'
SELECT format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', e.extname, n.nspname)
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('uuid-ossp', 'pgcrypto')
ORDER BY e.extname;
SQL

# -----------------------------------------------------------------------------
# B) public sema
# -----------------------------------------------------------------------------
#   --schema-only        : yalnizca DDL, VERI YOK
#   --schema=public      : uygulamanin semasi (auth/storage Supabase'in kendisi)
#   --no-owner           : hedef projede ALTER ... OWNER TO postgres denemesin
#   --no-publications    : her Supabase projesinde supabase_realtime ZATEN var
#   --no-subscriptions   : yok ama garanti
#   --no-tablespaces     : Supabase'de anlamsiz
#   --no-security-labels : pgsodium/anon etiketleri hedefte catisabilir
#   ACL (GRANT/REVOKE) BILEREK DAHIL — --no-acl KULLANMIYORUZ. 022'deki
#     "REVOKE EXECUTE ON is_super_admin FROM PUBLIC/anon" bir ACL'dir;
#     --no-acl ile duserse anon rolu is_super_admin'i cagirabilir hale gelir.
#   COMMENT'ler BILEREK DAHIL (super_admins tablosunun uyari metni orada).
pg_dump "$PGURI" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-publications \
  --no-subscriptions \
  --no-tablespaces \
  --no-security-labels \
  -f "$TMP/public.sql"

# TEMIZLIK — her satirin gerekcesi:
#  1) \restrict / \unrestrict : pg_dump 17.5+ psql meta-komutu ekler.
#     Supabase SQL Editor'a yapistirilinca "syntax error at \" verir.
#  2) COMMENT ON SCHEMA public : hedefte semanin sahibi pg_database_owner;
#     "must be owner of schema public" hatasi verir. Kayipsiz — sadece yorum.
#  3) CREATE SCHEMA public / ALTER SCHEMA public OWNER : hedefte zaten var.
#  NOT: "\" icin [\] bracket ifadesi kullaniliyor. '\\restrict' yazimi bazi
#  ortamlarda (Windows/MSYS) argüman islenirken bozuluyor ve SESSIZCE hicbir
#  satiri silmiyor; [\] her yerde dogru calisiyor (test edildi).
sed -i -e '/^[\]restrict/d' \
       -e '/^[\]unrestrict/d' \
       -e '/^COMMENT ON SCHEMA public /d' \
       -e '/^CREATE SCHEMA public;$/d' \
       -e '/^ALTER SCHEMA public OWNER TO /d' \
       "$TMP/public.sql"

# -----------------------------------------------------------------------------
# C) storage.objects policy'leri — pg_policies'ten DDL uretimi
# -----------------------------------------------------------------------------
psql "$PGURI" -Atq -o "$TMP/storage.sql" <<'SQL'
SELECT string_agg(stmt, E'\n' ORDER BY policyname)
FROM (
  SELECT policyname,
         format(
           E'DROP POLICY IF EXISTS %I ON storage.objects;\nCREATE POLICY %I ON storage.objects\n  AS %s\n  FOR %s\n  TO %s%s%s;\n',
           policyname, policyname, permissive, cmd,
           array_to_string(roles, ', '),
           CASE WHEN qual       IS NULL THEN '' ELSE E'\n  USING (' || qual || ')' END,
           CASE WHEN with_check IS NULL THEN '' ELSE E'\n  WITH CHECK (' || with_check || ')' END
         ) AS stmt
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
) s;
SQL

# -----------------------------------------------------------------------------
# BIRLESTIR
# -----------------------------------------------------------------------------
{
  echo "-- ============================================================================="
  echo "-- 000_baseline.sql — CANLI SEMANIN TAM DOKUMU (uretilmis dosya, ELLE DUZENLEMEYIN)"
  echo "-- ============================================================================="
  echo "--"
  echo "-- Uretim tarihi : $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "-- Uretim araci  : scripts/dump-baseline.sh"
  echo "-- pg_dump       : $(pg_dump --version | head -1)"
  echo "-- Sunucu        : PostgreSQL $(psql "$PGURI" -Atc 'SHOW server_version;')"
  echo "--"
  echo "-- Bu dosya 001-026 arasindaki migration'larin YERINE gecer. O dosyalar"
  echo "-- sifirdan kurulum uretemiyordu (bkz. archive/README.md); tarihsel kayit"
  echo "-- olarak archive/ altinda duruyor."
  echo "--"
  echo "-- ICERIK: eklentiler + public sema (tablo/index/constraint/RLS/policy/"
  echo "-- fonksiyon/trigger/GRANT/COMMENT) + storage.objects policy'leri."
  echo "-- VERI ICERMEZ. Tohum icin: 001_seed_default.sql (baseline'dan SONRA)."
  echo "--"
  echo "-- CALISTIRMA (KURULUM.md Adim 3):"
  echo "--   psql \"\$PGURI\" -v ON_ERROR_STOP=1 --single-transaction -f 000_baseline.sql"
  echo "--   psql \"\$PGURI\" -v ON_ERROR_STOP=1 --single-transaction -f 001_seed_default.sql"
  echo "--"
  echo "-- YENIDEN URETIM: sema degistiginde bu dosya ELLE DUZENLENMEZ. Once yeni"
  echo "-- migration (027+) yazilir ve canliya uygulanir; baseline ancak dosyalar"
  echo "-- birikince ayni script'le YENIDEN URETILIR. Gerekce: NOTE.md."
  echo "-- ============================================================================="
  echo
  echo "-- ============================================================================="
  echo "-- BOLUM A — EKLENTILER"
  echo "-- ============================================================================="
  cat "$TMP/ext.sql"
  echo
  echo "-- ============================================================================="
  echo "-- BOLUM B — public SEMASI (pg_dump ciktisi)"
  echo "-- ============================================================================="
  cat "$TMP/public.sql"
  echo
  echo "-- ============================================================================="
  echo "-- BOLUM C — storage.objects POLICY'LERI"
  echo "-- ============================================================================="
  echo "-- Kaynak: canli pg_policies (pg_dump storage semasini getiremez)."
  echo "-- Policy'ler bucket_id degerine bakar; 'images' bucket'inin bu dosyadan"
  echo "-- once olusturulmasi SART DEGIL, ama yukleme yapilmadan once olmali"
  echo "-- (KURULUM.md Adim 4)."
  echo "-- Yetki hatasi (must be owner of table objects) alinirsa policy'ler"
  echo "-- Dashboard > Storage > Policies ekranindan elle kurulur."
  echo "-- Eski Dashboard isimleri (varsa) temizlenir:"
  echo 'DROP POLICY IF EXISTS "Public read access" ON storage.objects;'
  echo 'DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;'
  echo 'DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;'
  echo 'DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;'
  echo
  cat "$TMP/storage.sql"
  echo
  echo "-- ============================================================================="
  echo "-- 000_baseline.sql sonu"
  echo "-- ============================================================================="
} > "$OUT"

# -----------------------------------------------------------------------------
# DOGRULAMA — sessiz basarisizlik olmasin
# -----------------------------------------------------------------------------
fail=0
chk() { if [ "$1" -eq 0 ]; then echo "  OK   $2"; else echo "  HATA $2"; fail=1; fi; }
chk_absent() { if [ "$1" -ne 0 ]; then echo "  OK   $2"; else echo "  HATA $2"; fail=1; fi; }

echo
echo "Dogrulama:"
set +e
grep -qiE '^(INSERT INTO|COPY .* FROM stdin)' "$OUT"; chk_absent $? "veri yok (INSERT/COPY satiri bulunmadi)"
grep -qE '^[\](un)?restrict' "$OUT";                  chk_absent $? "psql meta-komutu yok (SQL Editor'a yapistirilabilir)"

grep -q 'CREATE EXTENSION' "$OUT";                          chk $? "eklenti satirlari var"
grep -q 'CREATE TABLE public.tenants'  "$OUT";              chk $? "tenants tablosu var"
grep -q 'CREATE TABLE public.super_admins' "$OUT";          chk $? "super_admins tablosu var (022)"
grep -q 'CREATE TABLE public.homepage_sections' "$OUT";     chk $? "homepage_sections var (025 drift)"
grep -q 'CREATE TABLE public.content_media' "$OUT";         chk $? "content_media var (019 drift)"
grep -q 'FROM public.super_admins' "$OUT";                  chk $? "is_super_admin DOGRU surum (super_admins okuyor, 022)"
grep -q 'REVOKE ALL ON FUNCTION public.is_super_admin' "$OUT"; chk $? "022 REVOKE korunmus (ACL dahil)"
grep -q 'user_has_tenant_access' "$OUT";                    chk $? "user_has_tenant_access fonksiyonu var"
grep -q 'prevent_default_tenant_deactivation' "$OUT";       chk $? "014 trigger fonksiyonu var"
grep -q 'set_updated_at_timestamp' "$OUT";                  chk $? "009 updated_at trigger fonksiyonu var"
grep -q 'images_tenant_insert' "$OUT";                      chk $? "storage tenant policy'leri var (017)"

# 7 kayip kolon — canlida vardi, hicbir migration'da yoktu (Faz 2 teshisi)
for pair in "news:video_url" "news:youtube_url" "announcements:video_url" \
            "announcements:youtube_url" "headlines:content" "headlines:video_url" \
            "headlines:youtube_url"; do
  tbl="${pair%%:*}"; col="${pair##*:}"
  awk "/^CREATE TABLE public\\.$tbl \\(/,/^\\);/" "$OUT" | grep -qw "$col"
  chk $? "$tbl.$col kolonu baseline'da"
done
set -e

echo
if [ "$fail" -ne 0 ]; then
  echo "SONUC: EKSIK VAR — dosyayi repo'ya ALMAYIN, ciktiyi paylasin." >&2
  exit 1
fi
echo "SONUC: TAMAM. $OUT ($(wc -l < "$OUT") satir, $(du -h "$OUT" | cut -f1))"
echo "Sonraki adim: dosyayi repo'da supabase/migrations/000_baseline.sql olarak kaydedin."
