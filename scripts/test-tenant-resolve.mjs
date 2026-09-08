/**
 * Tenant cozumleme testi — 8 Eylul 2026 "admin panelinde YANLIS TENANT"
 * bug'ini kilitler.
 *
 * CALISTIRMA:
 *   npm run test:tenant
 *   (= node scripts/test-tenant-resolve.mjs)
 *
 * BUG NEYDI (regresyon kaydi):
 *   custom_domain (kurmayteknoloji.com) uzerinden /admin'e girildiginde panel
 *   DEFAULT tenant'in verilerini gosteriyordu. Public taraf dogruydu.
 *   Sebep: tenant IKI AYRI YOLDAN cozuluyordu —
 *     sunucu : middleware custom_domain DB lookup -> x-tenant-slug (DOGRU)
 *     istemci: useTenant, hostname'den (custom_domain'i cozemez)
 *   Istemci once slug ile ariyordu:
 *       slug = (custom_domain ise) "default"
 *       .eq("slug","default")           -> HER ZAMAN satir doner
 *       if (!data) { custom_domain ara } -> HIC CALISMAZ (olu kod)
 *   Sonuc: sunucu "Kurmay", istemci "default". Panelin tamami istemcinin
 *   degerini kullaniyordu.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) planTenantQuery custom_domain host'unda ASLA slug="default" uretmez
 *   (b) initialTenant verildiginde istemci sorgusu HIC atilmaz
 *   (c) custom_domain bulunamazsa null doner — default'a DUSMEZ
 *
 * ⚠️ KAPSAM SINIRI (bilincli):
 *   Repoda React test kosucusu yok. Asagidaki simulateProvider(),
 *   useTenant.tsx'teki TenantProvider akisinin BIREBIR kopyasidir
 *   (needsClientResolve -> planTenantQuery -> tek sorgu). Hook'un bu akisi
 *   degisirse BURASI DA guncellenmeli — aksi halde test yesil kalirken
 *   gercek davranis kayabilir. Sorgu ADEDI ve HANGI KOLONLA yapildigi
 *   sahte client uzerinden gercekten olculur.
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  planTenantQuery,
  needsClientResolve,
} from "../src/lib/tenant-hostname.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-sanitize.mjs / test-parse-hostname.mjs deseni)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

/** @param {string} group @param {string} name @param {unknown} actual @param {unknown} expected @param {string} input */
function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name, input, out: a, problems: [`beklenen ${e}`] });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Sahte Supabase client — atilan sorgulari KAYDEDER
// ---------------------------------------------------------------------------
/**
 * @param {Record<string, object>} rows  "kolon=deger" -> donecek satir
 */
function makeFakeClient(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              calls.push({ table, column, value });
              return {
                maybeSingle: async () => ({
                  data: rows[`${column}=${value}`] ?? null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

/**
 * useTenant.tsx TenantProvider akisinin birebir kopyasi.
 * Bkz. dosya basindaki "KAPSAM SINIRI" notu.
 */
async function simulateProvider(fakeClient, initialTenant, hostname) {
  if (!needsClientResolve(initialTenant)) {
    // Sunucu zaten cozdu → SORGU YOK
    return { tenant: initialTenant ?? null, calls: fakeClient.calls };
  }
  const plan = planTenantQuery(hostname);
  const { data } = await fakeClient
    .from("tenants")
    .select("*")
    .eq(plan.by, plan.value)
    .maybeSingle();
  // Fallback zinciri YOK — bulunamadiysa null.
  return { tenant: data ?? null, calls: fakeClient.calls };
}

const PROD = "buyukdirilis.org.tr";
process.env.NEXT_PUBLIC_ROOT_DOMAIN = PROD;

const KURMAY = { id: "t-kurmay", slug: "kurmay-teknoloji", name: "Kurmay Teknoloji" };
const DEFAULT_TENANT = { id: "t-default", slug: "default", name: "Sendika Adı" };

// DB durumu: default HER ZAMAN var (014_protect_default_tenant) — bug'in
// besleyicisi tam olarak buydu.
const DB = {
  "slug=default": DEFAULT_TENANT,
  "slug=kurmay-teknoloji": KURMAY,
  "custom_domain=kurmayteknoloji.com": KURMAY,
};

// ---------------------------------------------------------------------------
console.log("\n(a) planTenantQuery — custom_domain ASLA slug=default uretmez\n");

/** @param {string} hostname @param {object} expected */
function checkPlan(hostname, expected) {
  ok("plan", hostname, planTenantQuery(hostname), expected, hostname);
}

// ⬇ ASIL BUG: burasi { by:"slug", value:"default" } uretirse bug geri gelmistir
checkPlan("kurmayteknoloji.com", { by: "custom_domain", value: "kurmayteknoloji.com" });
checkPlan("www.kurmayteknoloji.com", { by: "custom_domain", value: "kurmayteknoloji.com" });
checkPlan("WWW.KurmayTeknoloji.COM:443", { by: "custom_domain", value: "kurmayteknoloji.com" });
// DB'de olmayan bir custom domain de yine custom_domain ile aranir (default DEGIL)
checkPlan("tanimsiz-domain.com", { by: "custom_domain", value: "tanimsiz-domain.com" });

checkPlan("kurmay-teknoloji.buyukdirilis.org.tr", { by: "slug", value: "kurmay-teknoloji" });
checkPlan("www.kurmay-teknoloji.buyukdirilis.org.tr", { by: "slug", value: "kurmay-teknoloji" });
checkPlan("buyukdirilis.org.tr", { by: "slug", value: "default" });
checkPlan("www.buyukdirilis.org.tr", { by: "slug", value: "default" });
checkPlan("localhost:3000", { by: "slug", value: "default" });

// ---------------------------------------------------------------------------
console.log("\n(b) initialTenant VERILDI → istemci sorgusu HIC atilmamali\n");

{
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, KURMAY, "kurmayteknoloji.com");
  ok("initial", "sorgu adedi 0", r.calls.length, 0, "initialTenant=KURMAY");
  ok("initial", "tenant = sunucunun verdigi", r.tenant, KURMAY, "initialTenant=KURMAY");
}
{
  // Subdomain'de de ayni: sunucu cozduyse istemci tekrar cozmez
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, KURMAY, "kurmay-teknoloji.buyukdirilis.org.tr");
  ok("initial", "subdomain'de de sorgu adedi 0", r.calls.length, 0, "initialTenant=KURMAY");
}
{
  // initialTenant YOKSA sorgu atilir (fallback yolu gercekten calisiyor mu)
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "kurmayteknoloji.com");
  ok("initial", "initialTenant yok → 1 sorgu", r.calls.length, 1, "initialTenant=null");
}

// ---------------------------------------------------------------------------
console.log("\n(c) FALLBACK — custom_domain host'unda default'a DUSMEMELI\n");

{
  // Bug senaryosunun ta kendisi: initialTenant olmadan, custom domain
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "kurmayteknoloji.com");
  ok("fallback", "dogru tenant cozuldu", r.tenant, KURMAY, "kurmayteknoloji.com");
  ok(
    "fallback",
    "sorgu custom_domain kolonuyla yapildi",
    r.calls,
    [{ table: "tenants", column: "custom_domain", value: "kurmayteknoloji.com" }],
    "kurmayteknoloji.com"
  );
  ok(
    "fallback",
    "slug=default sorgusu HIC atilmadi",
    r.calls.some((c) => c.column === "slug" && c.value === "default"),
    false,
    "kurmayteknoloji.com"
  );
}
{
  // DB'de olmayan custom domain → null. ESKIDEN default doner, panel
  // baska tenant'in verisini gosterirdi.
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "tanimsiz-domain.com");
  ok("fallback", "bulunamayan custom_domain → null", r.tenant, null, "tanimsiz-domain.com");
  ok(
    "fallback",
    "bulunamayinca default'a DUSMEDI (tek sorgu)",
    r.calls.length,
    1,
    "tanimsiz-domain.com"
  );
  ok(
    "fallback",
    "slug=default sorgusu HIC atilmadi",
    r.calls.some((c) => c.column === "slug" && c.value === "default"),
    false,
    "tanimsiz-domain.com"
  );
}
{
  // Subdomain yolu bozulmadi
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "kurmay-teknoloji.buyukdirilis.org.tr");
  ok("fallback", "subdomain → dogru tenant", r.tenant, KURMAY, "subdomain");
}
{
  // Apex yolu bozulmadi — apex'te default DOGRU cevap
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "buyukdirilis.org.tr");
  ok("fallback", "apex → default (dogru)", r.tenant, DEFAULT_TENANT, "apex");
}
{
  // Olmayan subdomain → null (burada da sessizce default'a dusulmez)
  const fake = makeFakeClient(DB);
  const r = await simulateProvider(fake, null, "olmayan-slug.buyukdirilis.org.tr");
  ok("fallback", "olmayan subdomain → null", r.tenant, null, "olmayan-slug");
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failures.length} kaldi\n`);
process.exit(failures.length === 0 ? 0 : 1);
