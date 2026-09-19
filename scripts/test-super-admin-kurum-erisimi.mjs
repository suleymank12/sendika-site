/**
 * Super admin'in KURUM VERISINE erisimi — P1 testi (19 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:super-admin-kurum
 *   (= node scripts/test-super-admin-kurum-erisimi.mjs)
 *
 * BAGLAM (canli olcum):
 *   Super admin hesabi hicbir kurumun uyesi olmadigi halde
 *   kurmayteknoloji.com/admin adresinden Kurmay'in panelinde ACILDI.
 *   Kok neden IKI KATMANLIYDI:
 *     (1) admin/(authenticated)/layout.tsx — uyelik kontrolunu atlayan bypass
 *     (2) user_has_tenant_access fonksiyonundaki OR is_super_admin — ASIL yetki
 *
 *   🔴 (1) tek basina duzeltilse YETMEZDI: tarayici PostgREST'e DOGRUDAN
 *   konusuyor, layout yalnizca bir ekran. Bu testin en onemli isi, IKISININ
 *   BIRLIKTE duruyor olmasini garanti etmek — biri geri gelirse kirilsin.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) layout — bypass kalkti, tek olcut uyelik
 *   (b) migration 029 — imza-uyumlu, tek satir degisti, politikalara
 *       dokunulmadi, drift kontrolu ve rollback yazili
 *   (c) baseline BOZULMADI (000_baseline elle duzenlenmez kurali)
 *   (d) super admin panelinin service-role yollari korundu (kirilmadi)
 *   (e) "Admin paneline gir" baglantisi kalkti, yerine yolu anlatan metin
 *   (f) KURULUM.md Adim 3 — 029 listede ve psql komutunda
 *
 * ⚠️ KAPSAM SINIRI: SQL CALISTIRILMAZ (repoda DB kosucusu yok). Fonksiyonun
 *   canli davranisi migration icindeki (0)/(1) sorgulariyla ELLE dogrulanir.
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (diger test script'leriyle ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

const read = (p) => readFileSync(p, "utf8");

/**
 * "Bu dosyada su gecmesin" kontrolleri icin yorumlari atar.
 * Gerekce ve sinirlar: scripts/test-setup-guide.mjs (ayni yardimci).
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/** SQL yorumlarini (-- ile baslayan satirlar) atar. */
function stripSqlComments(src) {
  return src
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const MIGRATION = "supabase/migrations/029_super_admin_kurum_erisimi_kaldir.sql";
const LAYOUT = "src/app/admin/(authenticated)/layout.tsx";
const BASELINE = "supabase/migrations/000_baseline.sql";
const TENANTS_PAGE = "src/app/super-admin/(authenticated)/tenants/page.tsx";

// ---------------------------------------------------------------------------
header("(a) Layout — super admin muafiyeti KALKTI");
// ---------------------------------------------------------------------------
{
  const src = read(LAYOUT);
  const code = stripComments(src);

  // 🔴 Bypass'in kendisi: is_super_admin RPC'si + erken return
  okTrue("layout", "is_super_admin RPC'si YOK", !code.includes("is_super_admin"), LAYOUT);
  okTrue("layout", "isSuperAdmin degiskeni YOK", !code.includes("isSuperAdmin"), LAYOUT);

  // Uyelik kontrolu DURUYOR ve tek olcut o
  okTrue("layout", "tenant_users uyelik sorgusu duruyor", code.includes('.from("tenant_users")'), LAYOUT);
  okTrue("layout", "uye degilse /admin/yetkisiz", code.includes('redirect("/admin/yetkisiz")'), LAYOUT);
  okTrue("layout", "uyelik yoksa panel ACILMIYOR", code.includes("if (!membership) {"), LAYOUT);

  // AdminShell'e TEK cikis olmali: uyelik kontrolunden SONRA.
  // Iki cikis varsa biri yine bypass demektir.
  ok("layout", "AdminShell donusu TEK yerde", (code.match(/<AdminShell /g) || []).length, 1, LAYOUT);
  okTrue(
    "layout",
    "AdminShell donusu uyelik kontrolunden SONRA",
    code.indexOf("if (!membership)") < code.indexOf("<AdminShell "),
    "sira"
  );

  // Pasif kurum kapisi korundu (bu bir guvenlik kurali degil, reaktivasyon akisi)
  okTrue("layout", "pasif kurum kapisi duruyor", code.includes("AdminTenantPasifView"), LAYOUT);
  // Fail-closed katmani korundu
  okTrue("layout", "tenant cozulemezse kapali", code.includes("AdminTenantBulunamadiView"), LAYOUT);

  // 🔴 Yorum, ikinci katmani (RLS) ISARET ETMELI: layout tek basina yetmiyor.
  okTrue("layout", "yorum migration 029'a isaret ediyor", src.includes("029"), LAYOUT);
  okTrue("layout", "yorum 'tek basina yetmez'i anlatiyor", src.includes("PostgREST"), LAYOUT);
}

// ---------------------------------------------------------------------------
header("(b) Migration 029 — imza-uyumlu, tek satir, politikalara dokunmuyor");
// ---------------------------------------------------------------------------
{
  const src = read(MIGRATION);
  const sql = stripSqlComments(src);

  okTrue("029", "fonksiyon CREATE OR REPLACE ile", sql.includes("CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param uuid)"), MIGRATION);

  // 🔴 ASIL DEGISIKLIK: kisayol kalkti
  okTrue("029", "OR is_super_admin KALDIRILDI", !sql.includes("is_super_admin"), MIGRATION);
  okTrue("029", "tenant_users sorgusu duruyor", sql.includes("FROM public.tenant_users"), MIGRATION);
  okTrue("029", "auth.uid() ile eslesme duruyor", sql.includes("WHERE user_id = auth.uid() AND tenant_id = tenant_id_param"), MIGRATION);

  // IMZA / NITELIK UYUMU — biri degisirse apply patlar ya da guvenlik geriler
  okTrue("029", "parametre adi korundu (tenant_id_param)", sql.includes("tenant_id_param uuid"), "imza");
  okTrue("029", "SECURITY DEFINER korundu", sql.includes("SECURITY DEFINER"), "nitelik");
  okTrue("029", "SET search_path = public korundu", sql.includes("SET search_path = public"), "nitelik");
  okTrue("029", "LANGUAGE sql korundu", sql.includes("LANGUAGE sql"), "nitelik");
  okTrue("029", "STABLE korundu", sql.includes("STABLE"), "nitelik");
  okTrue("029", "RETURNS boolean korundu", sql.includes("RETURNS boolean"), "imza");

  // 🔴 POLITIKALARA DOKUNULMAMALI — 16 tablo + 3 storage politikasi yerinde kalir
  okTrue("029", "CREATE POLICY YOK", !sql.includes("CREATE POLICY"), MIGRATION);
  okTrue("029", "DROP POLICY YOK", !sql.includes("DROP POLICY"), MIGRATION);
  okTrue("029", "ALTER TABLE YOK", !sql.includes("ALTER TABLE"), MIGRATION);
  okTrue("029", "DROP FUNCTION YOK (REPLACE kullanilir)", !sql.includes("DROP FUNCTION"), MIGRATION);

  // Islem sinirlari
  okTrue("029", "BEGIN/COMMIT icinde", sql.includes("BEGIN;") && sql.includes("COMMIT;"), MIGRATION);
  okTrue("029", "GRANT EXECUTE yazili", sql.includes("GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;"), MIGRATION);
  okTrue("029", "COMMENT niyeti aciklyor", sql.includes("COMMENT ON FUNCTION public.user_has_tenant_access(uuid)"), MIGRATION);

  // 🔴 DRIFT KONTROLU ve ROLLBACK yazili olmali (NOTE "elle apply" modeli)
  okTrue("029", "apply ONCESI drift sorgusu var", src.includes("pg_get_functiondef('public.user_has_tenant_access(uuid)'::regprocedure)"), MIGRATION);
  okTrue("029", "rollback bolumu var", src.includes("ROLLBACK"), MIGRATION);
  okTrue("029", "rollback kisayolu geri getiriyor", src.includes("OR public.is_super_admin(auth.uid());"), MIGRATION);
  okTrue("029", "apply sonrasi dogrulama var", src.includes("APPLY SONRASI DOGRULAMA"), MIGRATION);
  // Geri donme yolu (kendini tenant_users'a ekle) belgeli mi
  okTrue("029", "geri donme yolu yazili", src.includes("tenant_users"), MIGRATION);
}

// ---------------------------------------------------------------------------
header("(c) Baseline BOZULMADI — 000_baseline elle duzenlenmez");
// ---------------------------------------------------------------------------
{
  // KURULUM.md kurali: "000_baseline.sql elle duzenlenmez". Baseline canli
  // semanin dondurulmus hali; 029 onun USTUNE uygulanir. Baseline'i elle
  // degistirmek, yeniden uretildiginde sessizce geri alinacak bir yalan olur.
  const baseline = read(BASELINE);
  okTrue("baseline", "baseline'da kisayol HALA duruyor (dokunulmadi)", baseline.includes("OR public.is_super_admin(auth.uid());"), BASELINE);

  const kurulum = read("KURULUM.md");
  okTrue("baseline", "kural KURULUM.md'de yazili", kurulum.includes("`000_baseline.sql` **elle düzenlenmez**"), "KURULUM.md");
}

// ---------------------------------------------------------------------------
header("(d) Super admin panelinin yollari KIRILMADI");
// ---------------------------------------------------------------------------
{
  // Bu yollar user_has_tenant_access'e DEGIL, ya dogrudan is_super_admin
  // politikalarina ya da SERVICE ROLE'e dayaniyor — 029 onlari etkilemez.
  const baseline = read(BASELINE);

  // tenants ve tenant_users: dogrudan is_super_admin
  for (const policy of [
    "tenants_super_admin_insert",
    "tenants_super_admin_update",
    "tenants_super_admin_delete",
    "tenant_users_super_admin_insert",
    "tenant_users_super_admin_update",
    "tenant_users_super_admin_delete",
    "tenant_users_self_or_super_select",
  ]) {
    okTrue("kirilmadi", `${policy} dogrudan is_super_admin`, new RegExp(`${policy}[\\s\\S]{0,400}?is_super_admin`).test(baseline), policy);
  }

  // 🔴 EN KRITIK: super admin kendini bir kuruma EKLEYEBILMELI — geri donme
  // yolu bu. tenant_users_super_admin_insert user_has_tenant_access'e
  // dayansaydi 029 bu yolu da kapatir, super admin kilitlenirdi.
  okTrue(
    "kirilmadi",
    "tenant_users INSERT user_has_tenant_access'e DAYANMIYOR",
    !/tenant_users_super_admin_insert[\s\S]{0,400}?user_has_tenant_access/.test(baseline),
    "geri donme yolu"
  );

  // Super admin API'leri service role kullaniyor
  const routes = [
    "create-tenant", "delete-tenant", "orphan-users", "tenant-setup-check",
    "tenant-users", "toggle-tenant", "update-tenant",
  ];
  for (const r of routes) {
    const src = read(`src/app/api/super-admin/${r}/route.ts`);
    okTrue("kirilmadi", `${r} service role kullaniyor`, src.includes("createAdminClient"), r);
  }
  okTrue("kirilmadi", "tenant-users/list service role", read("src/app/api/super-admin/tenant-users/list/route.ts").includes("createAdminClient"), "list");

  // Super admin panelinin dogrudan sorgusu yalniz `tenants`
  const page = stripComments(read(TENANTS_PAGE));
  okTrue("kirilmadi", "tenants sayfasi yalniz tenants tablosunu okuyor", page.includes('.from("tenants")'), TENANTS_PAGE);
}

// ---------------------------------------------------------------------------
header("(e) 'Admin paneline gir' baglantisi kalkti, yerine yol metni");
// ---------------------------------------------------------------------------
{
  const src = read(TENANTS_PAGE);
  const code = stripComments(src);

  // Baglanti gitti
  okTrue("buton", "buildTenantAdminUrl cagrisi YOK", !code.includes("buildTenantAdminUrl"), TENANTS_PAGE);
  okTrue("buton", "olu import kalmadi", !code.includes('from "@/lib/tenant-hostname"'), TENANTS_PAGE);
  okTrue("buton", "'Admin paneline gir' metni YOK", !code.includes("Admin paneline gir"), TENANTS_PAGE);

  // Yerinde isaret + tablonun ustunde tam metin (kullanici karari:
  // "tamamen kaldirma, bilgi metnine donussun")
  okTrue("buton", "yerinde isaret duruyor", code.includes("<ShieldOff"), TENANTS_PAGE);
  okTrue("buton", "bilgi satiri var", code.includes("Kurum panellerine doğrudan girilmez."), TENANTS_PAGE);
  // Yol ACIK yazili olmali: nereye gidilecegi + iz birakma gerekcesi
  okTrue("buton", "yol: Tenant Admin Kullanicilari", code.includes("Tenant Admin Kullanıcıları"), TENANTS_PAGE);
  okTrue("buton", "yol: isin bitince cikar", code.includes("çıkarın"), TENANTS_PAGE);
  okTrue("buton", "gerekce: kayit altina girer", code.includes("kayıt altına girer"), TENANTS_PAGE);

  // Panelde Ingilizce yok (b8 terminoloji sozlesmesi)
  for (const banned of ["Dashboard", "Bypass", "Read-only", "Login"]) {
    okTrue("buton", `Ingilizce "${banned}" gecmiyor`, !code.includes(banned), banned);
  }

  // Bilgi satiri arama kutusundan ONCE gorunmeli.
  // Dayanak olarak JSX yorumu ({/* Search */}) KULLANILMAZ: stripComments
  // blok yorumlari siliyor, indexOf -1 donup kontrol sahte FAIL veriyordu.
  // Arama kutusunun placeholder'i kalici bir dayanak.
  okTrue(
    "buton",
    "bilgi satiri arama kutusundan once",
    code.indexOf("Kurum panellerine") < code.indexOf('placeholder="Tenant ara'),
    "sira"
  );
}

// ---------------------------------------------------------------------------
header("(f) KURULUM.md Adim 3 — 029 listede");
// ---------------------------------------------------------------------------
{
  const k = read("KURULUM.md");
  okTrue("kurulum", "029 dosya adi listede", k.includes("029_super_admin_kurum_erisimi_kaldir.sql"), "KURULUM.md");
  okTrue("kurulum", "psql komutu var", k.includes("-f supabase/migrations/029_super_admin_kurum_erisimi_kaldir.sql"), "KURULUM.md");
  okTrue("kurulum", "sayi guncellendi (uc dosya)", k.includes("**üç dosya**"), "KURULUM.md");
  okTrue("kurulum", "atlanirsa ne olur yazili", k.includes("kayıtsız erişir"), "KURULUM.md");

  // Sira: 029, 028'den SONRA calistirilmali
  okTrue(
    "kurulum",
    "029 psql satiri 028'den sonra",
    k.indexOf("-f supabase/migrations/028_") < k.indexOf("-f supabase/migrations/029_"),
    "sira"
  );
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
