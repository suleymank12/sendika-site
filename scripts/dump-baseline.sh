#!/usr/bin/env bash
# =============================================================================
# dump-baseline.sh — canli semanin baseline dokumunu uretir
# =============================================================================
#
# NE URETIR: supabase/migrations/000_baseline.sql adayi, dort parcadan olusur:
#   A) Eklentiler  — canlida hangi semada kuruluysa aynen (uuid-ossp, pgcrypto)
#   B) public sema — pg_dump --schema-only (tablo, index, constraint, RLS,
#                    policy, fonksiyon, trigger, GRANT/REVOKE, COMMENT)
#   C) storage.objects policy'leri — pg_dump bunlari GETIREMEZ (Supabase'de
#      storage semasinin sahibi supabase_storage_admin; semayi dumplamak
#      Supabase'in kendi tablolarini da getirir ve hedefte catisir).
#      Bu yuzden pg_policies'ten DDL yeniden uretilir — search_path='' ile,
#      yani ifadelerdeki fonksiyonlar semasiyla yazilir (bkz. BOLUM C).
#   D) Rol bazli REVOKE'lar — pg_dump bunlari da URETEMEZ: ACL'i PostgreSQL'in
#      sabit varsayilanina gore fark olarak yazar, bir rolun YOKLUGUNU yazamaz.
#      Canlida bir API rolune (anon/authenticated/service_role) verilmemis her
#      fonksiyon yetkisi canlidan okunup acik REVOKE olarak yazilir (BOLUM D).
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
#   ACL (GRANT/REVOKE) BILEREK DAHIL — --no-acl KULLANMIYORUZ: tablo ve
#     fonksiyon GRANT'lari ile 022'nin "REVOKE ... FROM PUBLIC"u buradan gelir.
#     AMA TEK BASINA YETMEZ (tatbikat BUG 3, 11 Eylul 2026). pg_dump ACL'i
#     PostgreSQL'in SABIT varsayilanina (acldefault: sahip + PUBLIC) gore FARK
#     olarak yazar — kaynagin ALTER DEFAULT PRIVILEGES'ine gore degil. O
#     varsayilanda bulunmayan bir rolun YOKLUGU fark sayilmaz, dump'a girmez:
#     022'nin "REVOKE ... FROM anon"u bu yuzden hic gelmez. Hedef proje ise
#     fonksiyonu Supabase'in ADP'si altinda yaratir; anon EXECUTE'u CREATE
#     aninda alir ve "FROM PUBLIC" onu KALDIRMAZ (ACL girdileri grantee
#     bazlidir). O yariyi BOLUM D canlidan uretir.
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

# EMNIYET (asagidaki TEMIZLIK 4 icin, sed'den ONCE): sed yalnizca satir basina
# bakar. "ALTER DEFAULT PRIVILEGES" baska bir girdide satir basinda gecseydi —
# orn. plpgsql govdesinde gecerli bir ifade olarak — onu da siler ve fonksiyonu
# SESSIZCE bozardi. Bu yuzden her eslesmenin bir "Type: DEFAULT ACL" girdisinde
# oldugu dogrulanir (awk, pg_dump'in "-- Name: ...; Type: ...;" basliklarini
# izler); degilse hicbir sey silinmeden DUR.
stray="$(awk '/^-- Name: .*; Type: / { acl = ($0 ~ /; Type: DEFAULT ACL; /) }
              /^ALTER DEFAULT PRIVILEGES / && !acl { print "  satir " NR ": " $0 }' "$TMP/public.sql")"
if [ -n "$stray" ]; then
  echo "HATA: DEFAULT ACL girdisi DISINDA 'ALTER DEFAULT PRIVILEGES' satiri var" >&2
  echo "      (sed onu da silerdi). Elle inceleyin:" >&2
  echo "$stray" >&2
  exit 1
fi

# TEMIZLIK — her satirin gerekcesi:
#  1) \restrict / \unrestrict : pg_dump 17.5+ psql meta-komutu ekler.
#     Supabase SQL Editor'a yapistirilinca "syntax error at \" verir.
#  2) COMMENT ON SCHEMA public : hedefte semanin sahibi pg_database_owner;
#     "must be owner of schema public" hatasi verir. Kayipsiz — sadece yorum.
#  3) CREATE SCHEMA public / ALTER SCHEMA public OWNER : hedefte zaten var.
#  4) ALTER DEFAULT PRIVILEGES (pg_dump'ta "Type: DEFAULT ACL" girdileri).
#     Canlida FOR ROLE postgres ve FOR ROLE supabase_admin icin 12'ser satir.
#     supabase_admin'inkiler hedefte "permission denied to change default
#     privileges" verir (postgres o role uye degil) ve SQL Editor ilk hatada
#     TUM calistirmayi durdurur (tatbikat, 10 Eylul 2026). Ikisi de yeni
#     Supabase projesinde zaten varsayilan — silmek KAYIPSIZ: hedefte ayni ADP
#     zaten var, biraksak da ayni grant'lari yeniden yazardi.
#     YANLIS VARSAYIM (BUG 3'e kadar burada yaziliydi): "baseline'in kendi
#     nesneleri ADP'den etkilenmez". Etkilenir — her CREATE hedefin ADP'si
#     altinda calisir, anon/authenticated/service_role yetkiyi CREATE aninda
#     alir. GRANT satirlari yalnizca EKLER; canlida bundan KISITLI olan yetki
#     ancak BOLUM D'nin acik REVOKE'uyla gelir. 027+ migration'larda GRANT'i
#     da REVOKE'u da acik yazin.
#  NOT: "\" icin [\] bracket ifadesi kullaniliyor. '\\restrict' yazimi bazi
#  ortamlarda (Windows/MSYS) argüman islenirken bozuluyor ve SESSIZCE hicbir
#  satiri silmiyor; [\] her yerde dogru calisiyor (test edildi).
sed -i -e '/^[\]restrict/d' \
       -e '/^[\]unrestrict/d' \
       -e '/^COMMENT ON SCHEMA public /d' \
       -e '/^CREATE SCHEMA public;$/d' \
       -e '/^ALTER SCHEMA public OWNER TO /d' \
       -e '/^ALTER DEFAULT PRIVILEGES /d' \
       "$TMP/public.sql"

# -----------------------------------------------------------------------------
# C) storage.objects policy'leri — pg_policies'ten DDL uretimi
# -----------------------------------------------------------------------------
# SEMA ONEKI (tatbikat BUG 1, 10 Eylul 2026): pg_policies.qual/with_check
# pg_get_expr() ciktisidir ve pg_get_expr bir nesneyi yalnizca O ANKI
# search_path'te GORUNMUYORSA semasiyla yazar. Canli rolun search_path'i
# ("$user", public, extensions) public'i icerdigi icin cagri semasiz geliyordu
# (storage.foldername ise semali — storage path'te yok). Yuklemede ise Bolum
# B'nin basindaki pg_dump satiri set_config('search_path', '', false) oturumu
# bos search_path'e ceker -> "function user_has_tenant_access(uuid) does not
# exist" -> uc tenant policy'si OLUSMUYORDU (storage tenant izolasyonu yok).
# COZUM: pg_dump'in Bolum B icin yaptigini burada da yap — sorgudan ONCE
# search_path'i bosalt. pg_get_expr o zaman pg_catalog disindaki HER nesneyi
# (fonksiyon, operator, tip; public, extensions, auth...) semasiyla yazar.
# Isim listesi ya da SQL metni uzerinde regex YOK. Alternatifler ve neden
# secilmedikleri: NOTE.md. Sonucu DOGRULAMA'daki sema oneki kontrolleri denetler.
# -q SART: -q olmadan psql SET'in "SET" etiketini de -o dosyasina yazar.
psql "$PGURI" -Atq -o "$TMP/storage.sql" <<'SQL'
SET search_path = '';
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
# D) ROL BAZLI REVOKE'lar — pg_dump'in URETEMEDIGI kisitlar (tatbikat BUG 3)
# -----------------------------------------------------------------------------
# Neden (BOLUM B'deki ACL notu): pg_dump bir rolun YOKLUGUNU yazamaz; hedefte o
# rol yetkiyi CREATE aninda Supabase'in ADP'sinden alir. Olculen (11 Eylul 2026):
#   canli       is_super_admin -> {postgres, authenticated, service_role}
#   yeni proje  is_super_admin -> + anon=X/postgres  (anon cagirabiliyordu)
# COZUM: canlinin yoklugunu ACIKCA yaz. Liste canlidan uretilir — isim listesi
# yok; sonradan eklenen ya da kisitlanan fonksiyonlar kendiliginden kapsanir.
# has_function_privilege ETKIN yetkiye bakar (PUBLIC ve rol uyeligi dahil):
# canlida bir rol fonksiyonu PUBLIC uzerinden cagirabiliyorsa REVOKE uretilmez
# — dogru, cunku pg_dump o durumda PUBLIC'i de korur.
# Roller: Supabase'in API rolleri (ADP'nin yetki verdigi uc rol).
# SEMA ONEKI: regprocedure bir fonksiyonu yalnizca search_path'te
# GORUNMUYORSA semasiyla yazar — BUG 1 ile ayni tuzak (yuklemede search_path
# bos; semasiz ad "does not exist" verir). Sorgudan once search_path bosaltilir.
# -q SART (Bolum C ile ayni gerekce).
psql "$PGURI" -Atq -o "$TMP/revoke.sql" <<'SQL'
SET search_path = '';
SELECT format('REVOKE ALL ON %s %s FROM %I;',
              CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
              p.oid::pg_catalog.regprocedure, r.rolname)
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
WHERE n.nspname = 'public'
  AND NOT pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
ORDER BY 1;
SQL

# TABLO DEDEKTORU — ayni sinif, tablo/gorunum/sequence icin. Canlida 0 satir
# (11 Eylul 2026 olculdu: 20 tablonun hepsinde uc rol de tum yetkilere sahip).
# Bir gun biri kisitlarsa (orn. REVOKE INSERT ON x FROM anon) pg_dump bunu da
# yazamaz ve hedefte ADP yetkiyi geri verir. Burada REVOKE URETILMEZ, script
# DURUR: tabloda "REVOKE <yetki> ON TABLE" o yetkinin KOLON grant'larini da
# siler — Bolum B'den SONRA calisan otomatik bir REVOKE, canlidaki kolon
# bazli grant'lari sessizce yok ederdi. O gun Bolum D bu durumu (kolon
# grant'lari dahil) bilerek kapsayacak sekilde genisletilir.
# MAINTAIN yalnizca PostgreSQL 17+'da var (eski sunucuda sorulursa hata verir).
tbl_gap="$(psql "$PGURI" -Atq <<'SQL'
SET search_path = '';
SELECT format('%s  rol=%s  yetki=%s', c.oid::pg_catalog.regclass, r.rolname, pr.priv)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
CROSS JOIN LATERAL unnest(
  CASE WHEN c.relkind = 'S' THEN ARRAY['USAGE', 'SELECT', 'UPDATE']
       ELSE ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
            || CASE WHEN current_setting('server_version_num')::int >= 170000
                    THEN ARRAY['MAINTAIN'] ELSE ARRAY[]::text[] END
  END) AS pr(priv)
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND NOT CASE WHEN c.relkind = 'S'
               THEN pg_catalog.has_sequence_privilege(r.oid, c.oid, pr.priv)
               ELSE pg_catalog.has_table_privilege(r.oid, c.oid, pr.priv) END
ORDER BY 1;
SQL
)"
if [ -n "$tbl_gap" ]; then
  echo "HATA: canlida Supabase varsayilanindan KISITLI tablo/sequence yetkisi var." >&2
  echo "      pg_dump bunu yazamaz; baseline'la kurulan projede yetki GERI GELIR." >&2
  echo "      Bolum D bu durumu henuz kapsamiyor (kolon grant'lari — yukaridaki not):" >&2
  echo "$tbl_gap" | sed 's/^/  /' >&2
  exit 1
fi
echo "tablo/sequence dedektoru: canlida Supabase varsayilanindan kisitli yetki yok"

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
  echo "-- fonksiyon/trigger/GRANT/COMMENT) + storage.objects policy'leri +"
  echo "-- rol bazli REVOKE'lar (Bolum D — pg_dump'in yazamadigi kisitlar)."
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
  echo "-- Bilerek cikarilanlar (gerekce: dump-baseline.sh TEMIZLIK): CREATE/ALTER/"
  echo "-- COMMENT ON SCHEMA public ve TUM ALTER DEFAULT PRIVILEGES satirlari."
  echo "-- Asagida govdesi bos kalan 'Type: SCHEMA', 'Type: COMMENT' ve"
  echo "-- 'Type: DEFAULT ACL' basliklari bunlardan kalir."
  cat "$TMP/public.sql"
  echo
  echo "-- ============================================================================="
  echo "-- BOLUM C — storage.objects POLICY'LERI"
  echo "-- ============================================================================="
  echo "-- Kaynak: canli pg_policies (pg_dump storage semasini getiremez)."
  echo "-- Ifadeler search_path='' ile uretildi: fonksiyonlar semasiyla yazili"
  echo "-- (public.user_has_tenant_access) ve Bolum B'nin bos search_path'inde cozulur."
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
  echo "-- BOLUM D — ROL BAZLI REVOKE'LAR (pg_dump'in yazamadigi kisitlar)"
  echo "-- ============================================================================="
  echo "-- Kaynak: canli pg_proc. Canlida ilgili rolun EXECUTE'u OLMAYAN her public"
  echo "-- fonksiyon icin bir satir. Neden: pg_dump ACL'i PostgreSQL'in sabit"
  echo "-- varsayilanina (sahip + PUBLIC) gore fark olarak yazar ve bir rolun"
  echo "-- YOKLUGUNU yazamaz. Bu proje ise fonksiyonlari Supabase'in ALTER DEFAULT"
  echo "-- PRIVILEGES'i altinda yaratir: anon/authenticated/service_role EXECUTE'u"
  echo "-- CREATE aninda alir ve Bolum B'deki 'REVOKE ... FROM PUBLIC' bunlari"
  echo "-- KALDIRMAZ. Bu satirlar olmadan canlida 022 ile anon'dan alinan"
  echo "-- is_super_admin EXECUTE'u yeni kurulumda GERI GELIR (tatbikat BUG 3)."
  echo "-- Dogrulama: KURULUM.md Adim 11, sorgu 4 (anon -> false)."
  cat "$TMP/revoke.sql"
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
grep -q '^ALTER DEFAULT PRIVILEGES' "$OUT";            chk_absent $? "ALTER DEFAULT PRIVILEGES satiri yok (permission denied; tatbikat BUG 2)"

grep -q 'CREATE EXTENSION' "$OUT";                          chk $? "eklenti satirlari var"
grep -q 'CREATE TABLE public.tenants'  "$OUT";              chk $? "tenants tablosu var"
grep -q 'CREATE TABLE public.super_admins' "$OUT";          chk $? "super_admins tablosu var (022)"
grep -q 'CREATE TABLE public.homepage_sections' "$OUT";     chk $? "homepage_sections var (025 drift)"
grep -q 'CREATE TABLE public.content_media' "$OUT";         chk $? "content_media var (019 drift)"
grep -q 'FROM public.super_admins' "$OUT";                  chk $? "is_super_admin DOGRU surum (super_admins okuyor, 022)"
# BUG 3: bu kontrol eskiden "022 REVOKE korunmus (ACL dahil)" etiketiyle yalniz
# 'REVOKE ALL ON FUNCTION public.is_super_admin' ariyordu — FROM PUBLIC
# satirina uyup 022'nin iki REVOKE'undan YALNIZ BIRINI kanitliyordu. Artik
# yalniz o yariyi iddia ediyor; anon yarisi en alttaki 24-26'da.
grep -qE '^REVOKE ALL ON FUNCTION public\.is_super_admin\([^)]*\) FROM PUBLIC;$' "$OUT"; chk $? "022'nin FROM PUBLIC yarisi var (tek basina YETMEZ — anon yarisi: Bolum D, asagida)"
grep -q 'user_has_tenant_access' "$OUT";                    chk $? "user_has_tenant_access fonksiyonu var"
grep -q 'prevent_default_tenant_deactivation' "$OUT";       chk $? "014 trigger fonksiyonu var"
grep -q 'set_updated_at_timestamp' "$OUT";                  chk $? "009 updated_at trigger fonksiyonu var"
grep -q 'images_tenant_insert' "$OUT";                      chk $? "storage tenant policy'leri var (017)"

# Tatbikat BUG 1: Bolum C'de SEMASIZ public fonksiyon cagrisi, Bolum B'nin bos
# search_path'inde "function ... does not exist" verir ve policy OLUSMAZ.
# Fonksiyon listesi dump'in kendisinden alinir -> sonradan eklenenler de kapsanir.
secC="$(awk '/^-- BOLUM C /{f=1} /^-- BOLUM D /{f=0} /^-- 000_baseline\.sql sonu/{f=0} f && !/^--/' "$OUT")"
grep -q 'public\.user_has_tenant_access(' <<<"$secC"; chk $? "storage policy'leri public.user_has_tenant_access(...) cagiriyor (sema onekli)"
unq=""
for fn in $(grep -oE '^CREATE FUNCTION public\.[a-z_][a-z0-9_]*\(' "$OUT" | sed -E 's/^CREATE FUNCTION public\.//; s/\($//'); do
  grep -qE "(^|[^.[:alnum:]_])$fn\(" <<<"$secC" && unq="$unq $fn"
done
[ -z "$unq" ]; chk $? "storage policy'lerinde semasiz public fonksiyon cagrisi yok${unq:+ (bulunan:$unq)}"

# 7 kayip kolon — canlida vardi, hicbir migration'da yoktu (Faz 2 teshisi)
for pair in "news:video_url" "news:youtube_url" "announcements:video_url" \
            "announcements:youtube_url" "headlines:content" "headlines:video_url" \
            "headlines:youtube_url"; do
  tbl="${pair%%:*}"; col="${pair##*:}"
  awk "/^CREATE TABLE public\\.$tbl \\(/,/^\\);/" "$OUT" | grep -qw "$col"
  chk $? "$tbl.$col kolonu baseline'da"
done

# Tatbikat BUG 3: pg_dump bir rolun YOKLUGUNU yazamaz; Bolum D yazar.
secD="$(awk '/^-- BOLUM D /{f=1} /^-- 000_baseline\.sql sonu/{f=0} f && NF && !/^--/' "$OUT")"

# (24) SABIT DEGISMEZ, CANLIYA sorulur. Bolum D ve (26) canliyi AYNALAR: canlida
#      biri anon'a EXECUTE verirse baseline bunu sadakatle kopyalar ve veri
#      gudumlu her kontrol yine gecer. Bu kontrol o korlugu kapatir.
live_anon="$(psql "$PGURI" -Atqc "SELECT has_function_privilege('anon', 'public.is_super_admin(uuid)', 'EXECUTE')" 2>&1)"
if [ "$live_anon" = "f" ]; then ek=""; else ek=" — donen: ${live_anon:-bos}"; fi
[ -z "$ek" ]; chk $? "CANLIDA anon is_super_admin'i cagiramiyor (022 canlida yerinde)$ek"

# (25) Dosyada: Bolum D anon'un EXECUTE'unu ACIKCA aliyor (satir birebir).
grep -qxF 'REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;' <<<"$secD"; chk $? "Bolum D: REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;"

# (26) Genel: Bolum D == canlidaki kisitlarin BAGIMSIZ turetimi. Bolum D
#      has_function_privilege'e sorar; bu kontrol ham ACL'i (proacl ->
#      aclexplode) okur — ayni listeye farkli yoldan varilmali. Bolum D bos
#      kalirsa, BIRLESTIR'den duserse ya da sorgusu bozulursa yakalar; sonradan
#      eklenen / kisitlanan her fonksiyonu kapsar. grantee 0 = PUBLIC;
#      proacl NULL = acldefault (PUBLIC cagirabilir) -> REVOKE beklenmez.
beklenen="$(psql "$PGURI" -Atq <<'SQL'
SET search_path = '';
SELECT format('REVOKE ALL ON %s %s FROM %I;',
              CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
              p.oid::pg_catalog.regprocedure, r.rolname)
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
WHERE n.nspname = 'public'
  AND p.proacl IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a
                  WHERE a.privilege_type = 'EXECUTE' AND a.grantee IN (r.oid, 0))
ORDER BY 1;
SQL
)"
fark="$(diff <(LC_ALL=C sort <<<"$secD") <(LC_ALL=C sort <<<"$beklenen"))"
[ -z "$fark" ]; chk $? "Bolum D = canlidaki fonksiyon kisitlari (proacl'den bagimsiz turetim, $(grep -c . <<<"$beklenen") satir)"
if [ -n "$fark" ]; then echo "    (< Bolum D'de fazla, > Bolum D'de eksik)"; sed 's/^/    /' <<<"$fark"; fi
set -e

echo
if [ "$fail" -ne 0 ]; then
  echo "SONUC: EKSIK VAR — dosyayi repo'ya ALMAYIN, ciktiyi paylasin." >&2
  exit 1
fi
echo "SONUC: TAMAM. $OUT ($(wc -l < "$OUT") satir, $(du -h "$OUT" | cut -f1))"
echo "Sonraki adim: dosyayi repo'da supabase/migrations/000_baseline.sql olarak kaydedin."
