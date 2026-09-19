/**
 * Panel Yoneticileri — P2 (seffaflik) testi, 19 Eylul 2026.
 *
 * CALISTIRMA:
 *   npm run test:panel-yoneticileri
 *   (= node scripts/test-panel-yoneticileri.mjs)
 *
 * BAGLAM:
 *   P1 (migration 029) super admin'in kurum verisine otomatik erisimini
 *   kaldirdi; artik bir kurumda is yapacaksa once kendini o kurumun
 *   tenant_users listesine ekliyor -> erisim IZ BIRAKIYOR. Ama musteri o
 *   izi GOREMIYORDU (politika herkese yalniz KENDI satirini gosteriyordu).
 *   P2 izi musteriye gorunur kiliyor.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) migration 030 — DROP+CREATE tek islemde, uc dal, SECURITY DEFINER
 *       fonksiyon uzerinden (NAIF alt sorgu DEGIL)
 *   (b) 🔴 FORCE ROW LEVEL SECURITY hicbir migration'da ACILMIYOR
 *       — acilirsa politika ozyinelemeye duser ve TUM ADMINLER KILITLENIR
 *   (c) API — yetkilendirme RLS'te, service role yalniz e-posta/rozet icin,
 *       fail-closed, veri minimizasyonu (user_id dondurulmez)
 *   (d) Ekran — salt okunur metni, rozet, sidebar, b8 (baslik = etiket)
 *   (e) KURULUM.md Adim 3 — 030 listede ve psql komutunda
 *
 * ⚠️ KAPSAM SINIRI: SQL CALISTIRILMAZ. Politikanin gercek davranisi
 *   (ozyineleme yok, kurum izolasyonu, admin layout uyelik sorgusu)
 *   yerel PostgreSQL'de ELLE olculdu — NOTE.md "P2 — SEFFAFLIK" tablosu.
 */

import { readFileSync, readdirSync } from "node:fs";

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

/** Yorumlari atar — gerekce ve sinirlar: scripts/test-setup-guide.mjs. */
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

const MIGRATION = "supabase/migrations/030_tenant_users_ayni_kurum_gorunur.sql";
const API = "src/app/api/panel-yoneticileri/route.ts";
const PAGE = "src/app/admin/(authenticated)/panel-yoneticileri/page.tsx";
const SIDEBAR = "src/components/admin/Sidebar.tsx";

// ---------------------------------------------------------------------------
header("(a) Migration 030 — politika");
// ---------------------------------------------------------------------------
{
  const src = read(MIGRATION);
  const sql = stripSqlComments(src);

  okTrue("030", "eski politika DROP ediliyor", sql.includes("DROP POLICY IF EXISTS tenant_users_self_or_super_select ON public.tenant_users;"), MIGRATION);
  okTrue("030", "yeni politika CREATE ediliyor", sql.includes("CREATE POLICY tenant_users_same_tenant_select ON public.tenant_users"), MIGRATION);
  okTrue("030", "FOR SELECT / TO authenticated", sql.includes("FOR SELECT") && sql.includes("TO authenticated"), MIGRATION);

  // 🔴 BEGIN/COMMIT SART: DROP ile CREATE arasinda politikasiz bir an
  // kalirsa (RLS acik + politika yok = hic kimse okuyamaz) istekler kilitlenir.
  okTrue("030", "tek islemde (BEGIN/COMMIT)", sql.includes("BEGIN;") && sql.includes("COMMIT;"), MIGRATION);
  okTrue("030", "DROP islem ICINDE", sql.indexOf("BEGIN;") < sql.indexOf("DROP POLICY"), "sira");
  okTrue("030", "COMMIT CREATE'ten SONRA", sql.indexOf("CREATE POLICY") < sql.indexOf("COMMIT;"), "sira");

  // Uc dal
  okTrue("030", "dal (1) kendi satirim", sql.includes("user_id = auth.uid()"), "dal 1");
  okTrue("030", "dal (2) ayni kurumun uyesiyim", sql.includes("OR public.user_has_tenant_access(tenant_id)"), "dal 2");
  okTrue("030", "dal (3) super admin ACIK yaziliyor", sql.includes("OR public.is_super_admin(auth.uid())"), "dal 3");

  // 🔴 NAIF ALT SORGU OLMAMALI — yerelde 42P17 infinite recursion verdi
  okTrue("030", "satir ici tenant_users alt sorgusu YOK", !/FROM\s+public\.tenant_users/i.test(sql), MIGRATION);
  okTrue("030", "ozyineleme gerekcesi belgeli (42P17)", src.includes("42P17"), MIGRATION);

  // Politikalara baska dokunus olmamali
  okTrue("030", "baska tabloya CREATE POLICY YOK", (sql.match(/CREATE POLICY/g) || []).length === 1, MIGRATION);
  okTrue("030", "CREATE/DROP FUNCTION YOK", !sql.includes("FUNCTION"), MIGRATION);
  okTrue("030", "ALTER TABLE YOK", !sql.includes("ALTER TABLE"), MIGRATION);

  // Drift kontrolu + rollback + kilitlenme kontrolu yazili
  okTrue("030", "apply ONCESI kontrol var", src.includes("APPLY ONCESI"), MIGRATION);
  okTrue("030", "rollback var", src.includes("ROLLBACK"), MIGRATION);
  okTrue("030", "rollback eski politikayi geri koyuyor", src.includes("CREATE POLICY tenant_users_self_or_super_select"), MIGRATION);
  okTrue("030", "🔴 kilitlenme kontrolu yazili", src.includes("KILITLENME KONTROLU"), MIGRATION);
}

// ---------------------------------------------------------------------------
header("(b) 🔴 FORCE ROW LEVEL SECURITY — hicbir yerde ACILMAMALI");
// ---------------------------------------------------------------------------
{
  // Politika, user_has_tenant_access'in (SECURITY DEFINER, sahibi postgres)
  // RLS'ten MUAF olmasina dayaniyor. Bu muafiyet yalniz
  // relforcerowsecurity=false iken gecerli. Biri FORCE acarsa politika
  // ozyinelemeye duser -> admin layout uyelik sorgusu patlar -> TUM KURUM
  // ADMINLERI KILITLENIR. Bu kontrol o gunu engellemek icin var.
  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  okTrue("force-rls", "migration dosyasi bulundu", files.length > 0, dir);

  for (const f of files) {
    const sql = stripSqlComments(read(`${dir}/${f}`));
    okTrue("force-rls", `${f}: FORCE ROW LEVEL SECURITY yok`, !/FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql), f);
  }

  // Uyari 030'da ve NOTE'ta yazili olmali (insan da bilsin)
  okTrue("force-rls", "030 uyariyi tasiyor", read(MIGRATION).includes("FORCE ROW LEVEL SECURITY"), MIGRATION);
  okTrue("force-rls", "NOTE.md uyariyi tasiyor", read("NOTE.md").includes("FORCE ROW LEVEL SECURITY"), "NOTE.md");
}

// ---------------------------------------------------------------------------
header("(c) API — yetkilendirme RLS'te, fail-closed, veri minimizasyonu");
// ---------------------------------------------------------------------------
{
  const src = read(API);
  const code = stripComments(src);

  okTrue("api", "super admin host'u reddediliyor", code.includes("rejectSuperAdminHost(req)"), API);
  okTrue("api", "oturum kontrolu var", code.includes("auth.getUser()"), API);

  // 🔴 Liste CAGIRANIN OTURUMUYLA okunuyor: kurum sinirini RLS uyguluyor.
  // Service role ile okunsaydi yetkilendirme elle yazilmis bir if olurdu.
  const listeIdx = code.indexOf('.from("tenant_users")');
  const adminIdx = code.indexOf("createAdminClient()");
  okTrue("api", "tenant_users cagiranin oturumuyla okunuyor", listeIdx !== -1 && listeIdx < adminIdx, "sira");
  okTrue("api", "bos liste -> 403 (uye degil)", code.includes("links.length === 0") && code.includes("status: 403"), API);

  // Service role YALNIZ e-posta + rozet icin
  okTrue("api", "e-postalar icin ortak yardimci", code.includes("getUserEmailsByIds(admin, userIds)"), API);
  okTrue("api", "rozet super_admins'ten", code.includes('.from("super_admins")'), API);

  // 🔴 FAIL-CLOSED: rozet okunamazsa liste rozetsiz GOSTERILMEZ — rozetsiz
  // bir platform yoneticisi siradan yonetici gibi gorunur.
  okTrue("api", "e-posta hatasinda fail-closed", code.includes("catch (err)") && code.includes("Yönetici bilgileri alınamadı"), API);
  okTrue("api", "rozet hatasinda fail-closed", code.includes("if (superError)"), API);

  // VERI MINIMIZASYONU (KVKK md. 4): user_id / rol DONDURULMEZ
  const cevapIdx = code.indexOf("yoneticiler: links.map");
  const cevap = code.slice(cevapIdx, cevapIdx + 400);
  okTrue("veri-min", "cevapta user_id YOK", !cevap.includes("user_id:"), "cevap");
  okTrue("veri-min", "cevapta rol YOK", !cevap.includes("role"), "cevap");
  okTrue("veri-min", "cevapta yalniz email/eklendi/platform", cevap.includes("email:") && cevap.includes("eklendi:") && cevap.includes("platform:"), "cevap");
}

// ---------------------------------------------------------------------------
header("(d) Ekran — salt okunur, rozet, sidebar");
// ---------------------------------------------------------------------------
{
  const page = read(PAGE);
  const code = stripComments(page);
  const sidebar = stripComments(read(SIDEBAR));

  // Salt okunur: yazma cagrisi OLMAMALI
  okTrue("ekran", "supabase yazma cagrisi YOK", !code.includes(".insert(") && !code.includes(".delete(") && !code.includes(".update("), PAGE);
  okTrue("ekran", "salt okunur metni var", code.includes("Bu liste salt okunurdur."), PAGE);
  okTrue("ekran", "nasil degisir yazili", code.includes("platform ekibiyle"), PAGE);
  okTrue("ekran", "ekranin amaci yazili", code.includes("kimlerin erişebildiğini"), PAGE);

  // Rozet
  okTrue("ekran", "platform rozeti", code.includes("Platform yöneticisi"), PAGE);
  okTrue("ekran", "rozet aciklamasi", code.includes("teknik destek veren ekip"), PAGE);

  // Hata durumunda BOS LISTE gosterilmez
  okTrue("ekran", "hata -> ListLoadError", code.includes("<ListLoadError"), PAGE);

  // Sidebar
  okTrue("sidebar", "madde eklendi", sidebar.includes('{ label: "Panel Yöneticileri", href: "/admin/panel-yoneticileri", icon: KeyRound }'), SIDEBAR);
  okTrue("sidebar", "Site Yonetimi grubunda", sidebar.indexOf('label: "Site Yönetimi"') < sidebar.indexOf("Panel Yöneticileri"), SIDEBAR);
  // 🔴 "Yonetim Kurulu" ile karismasin diye ad BILEREK "Panel Yoneticileri"
  okTrue("sidebar", '"Yönetim Kurulu" ayri madde olarak duruyor', sidebar.includes('label: "Yönetim Kurulu"'), SIDEBAR);
  okTrue("sidebar", 'yalin "Yöneticiler" maddesi YOK', !sidebar.includes('label: "Yöneticiler"'), SIDEBAR);
  // Ikon cakismasi olmasin: Users "Yonetim Kurulu"nun
  okTrue("sidebar", "ikon Users DEGIL (cakisma)", sidebar.includes("icon: KeyRound"), SIDEBAR);

  // b8: sayfa basligi = sidebar etiketi (birebir)
  okTrue("b8", "sayfa basligi sidebar etiketiyle ayni", code.includes('title="Panel Yöneticileri"'), PAGE);
  okTrue("b8", "yardim konusu bagli", code.includes('helpTopic="panel-yoneticileri"'), PAGE);
  okTrue("b8", "yardim icerigi var", read("src/lib/help-content.ts").includes('"panel-yoneticileri": {'), "help-content");

  // Panelde Ingilizce yok
  for (const banned of ["Admin", "Users", "Read-only", "Owner"]) {
    okTrue("b8", `Ingilizce "${banned}" gecmiyor`, !code.includes(`>${banned}`), banned);
  }
}

// ---------------------------------------------------------------------------
header("(e) KURULUM.md Adim 3");
// ---------------------------------------------------------------------------
{
  const k = read("KURULUM.md");
  okTrue("kurulum", "030 listede", k.includes("030_tenant_users_ayni_kurum_gorunur.sql"), "KURULUM.md");
  okTrue("kurulum", "psql komutu var", k.includes("-f supabase/migrations/030_tenant_users_ayni_kurum_gorunur.sql"), "KURULUM.md");
  // Dosya sayisi TURETILIYOR, sabit yazilmiyor: sabit yazim her yeni
  // migration'da alakasiz bir testi kirar (030 eklenince P1 testi tam olarak
  // oyle kirildi). Burasi KURULUM listesinin sahibi — yeni migration
  // eklenip KURULUM guncellenmezse BU test kirilsin, dogru davranis bu.
  const SAYI_YAZI = {
    1: "bir", 2: "iki", 3: "üç", 4: "dört", 5: "beş",
    6: "altı", 7: "yedi", 8: "sekiz", 9: "dokuz", 10: "on",
  };
  const baselineSonrasi = readdirSync("supabase/migrations")
    .filter((f) => /^0\d\d_.*\.sql$/.test(f) && !f.startsWith("000_") && !f.startsWith("001_"));
  ok("kurulum", "baseline sonrasi migration sayisi", baselineSonrasi.length, 4, baselineSonrasi.join(", "));
  okTrue(
    "kurulum",
    `KURULUM'daki sayi dosya sayisiyla uyusuyor (${baselineSonrasi.length})`,
    k.includes(`**${SAYI_YAZI[baselineSonrasi.length]} dosya**`),
    "KURULUM.md"
  );
  // Her biri psql komut blogunda da olmali
  for (const f of baselineSonrasi) {
    okTrue("kurulum", `${f} psql komutunda`, k.includes(`-f supabase/migrations/${f}`), f);
  }
  okTrue("kurulum", "ozyineleme uyarisi var", k.includes("sonsuz özyineleme"), "KURULUM.md");
  okTrue("kurulum", "030 psql satiri 029'dan sonra", k.indexOf("-f supabase/migrations/029_") < k.indexOf("-f supabase/migrations/030_"), "sira");

  // Baseline elle duzenlenmemeli — eski politika orada durmali
  const baseline = read("supabase/migrations/000_baseline.sql");
  okTrue("baseline", "baseline'da ESKI politika duruyor (dokunulmadi)", baseline.includes("tenant_users_self_or_super_select"), "baseline");
  okTrue("baseline", "baseline'da YENI politika YOK", !baseline.includes("tenant_users_same_tenant_select"), "baseline");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
