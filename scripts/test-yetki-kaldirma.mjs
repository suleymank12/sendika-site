/**
 * Yetki kaldirildiktan sonra acik oturum — testi (19 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:yetki-kaldirma
 *   (= node scripts/test-yetki-kaldirma.mjs)
 *
 * BAGLAM (canli bulgu):
 *   Bir kullanici tenant_users'tan cikarildiktan sonra ACIK sekmesinde
 *   panel calismaya devam ediyordu: sol menu tiklanabiliyor, sayfalar
 *   aciliyor, kullanici atilmiyor.
 *
 * 🟢 OLCULDU — BU BIR ERISIM ACIGI DEGIL (yerel gercek PostgreSQL, 10 tablo):
 *   yetki kalktigi anda kisi ANONIM ZIYARETCIYLE BIREBIR AYNI seyi goruyor.
 *   contact_messages 0, taslaklar gizli, TUM yazmalar reddediliyor,
 *   storage yuklemesi reddediliyor. Kapatilan sey veri erisimi degil,
 *   ACIK KALAN EKRAN.
 *
 * IKI AYRI KUSUR DUZELTILDI:
 *   (1) Ekran kapanmiyordu       -> MembershipGuard (gezinme + pencere odagi)
 *   (2) Silme YALAN soyluyordu   -> verifyWrite (RLS'in sessiz reddi)
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) write-guard — 0 satiri hataya cevirir, gercek hatayi AYNEN gecirir
 *   (b) MembershipGuard — gezinme + odak, POLL YOK, tasimada fail-open
 *   (c) 🔴 KAPSAM KILIDI — dosya basina sarili/sarilmamis yazma sayilari.
 *       Yeni bir UPDATE/DELETE eklenip siniflandirilmazsa test KIRILIR.
 *   (d) Bilincli sarilmamis yazmalar (temizlik + arka plan) yerinde
 *
 * ⚠️ KAPSAM SINIRI: SQL CALISTIRILMAZ. verifyWrite'in dayandigi davranis
 *   ("RLS reddederse UPDATE/DELETE 0 satir doner, HATA VERMEZ"; INSERT ise
 *   42501 verir) yerel PostgreSQL'de ELLE olculdu — NOTE.md tablosu.
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

/** Yorumlari atar — gerekce: scripts/test-setup-guide.mjs. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

const GUARD = "src/lib/write-guard.ts";
const MEMBER = "src/components/admin/MembershipGuard.tsx";
const SHELL = "src/components/admin/AdminShell.tsx";
const ADMIN = "src/app/admin/(authenticated)";

// ---------------------------------------------------------------------------
header("(a) write-guard — RLS'in sessiz reddi hataya cevriliyor");
// ---------------------------------------------------------------------------
{
  const src = read(GUARD);
  const code = stripComments(src);

  okTrue("guard", "verifyWrite dısa aktarilmis", code.includes("export async function verifyWrite"), GUARD);
  // Etkilenen satirlari gormek icin .select() SART — PostgREST aksi halde
  // temsil dondurmez ve 0 satir fark edilemez.
  okTrue("guard", 'sorguya .select("id") zincirleniyor', code.includes('query.select("id")'), GUARD);
  okTrue("guard", "0 satir -> RLS_BLOCKED", code.includes("if (!data || data.length === 0) return { error: RLS_BLOCKED };"), GUARD);
  // 🔴 Gercek hata AYNEN gecmeli: cagiran taraflarda error.code === "23505"
  // (tekil kisit) kontrolleri var, sentetik hata onlari bozmamali.
  okTrue("guard", "gercek hata aynen geciriliyor", code.includes("if (error) return { error };"), GUARD);
  okTrue("guard", "sentetik kod PostgreSQL kodlariyla cakismiyor", code.includes('code: "RLS_NO_ROWS"'), GUARD);
  okTrue("guard", "mesaj Turkce ve eylemi soyluyor", src.includes("sayfayı yenileyin"), GUARD);

  // Nerede KULLANILMAYACAGI belgeli olmali (temizlik silmelerinde 0 satir
  // DOGRU sonuctur; dogrulamak sahte hata uretir).
  okTrue("guard", "kullanilmayacak yerler belgeli", src.includes("NEREDE KULLANILMAZ"), GUARD);
  okTrue("guard", "INSERT'in zaten hata verdigi yazili", src.includes("INSERT"), GUARD);
}

// ---------------------------------------------------------------------------
header("(b) MembershipGuard — gezinme + odak, POLL YOK");
// ---------------------------------------------------------------------------
{
  const src = read(MEMBER);
  const code = stripComments(src);

  okTrue("uyelik", "gezinmede kontrol (pathname bagimliligi)", code.includes("usePathname()") && code.includes("[check, pathname]"), MEMBER);
  okTrue("uyelik", "pencere odaginda kontrol", code.includes('window.addEventListener("focus"'), MEMBER);
  okTrue("uyelik", "sekme gorunur olunca kontrol", code.includes('document.addEventListener("visibilitychange"'), MEMBER);

  // 🔴 POLL YOK — projenin cizgisi (Sidebar okunmamis sayaci da olay tabanli)
  okTrue("uyelik", "setInterval YOK", !code.includes("setInterval"), MEMBER);
  okTrue("uyelik", "setTimeout YOK", !code.includes("setTimeout"), MEMBER);

  // 🔴 TASIMADA FAIL-OPEN: ag hatasinda cikis YAPILMAZ, yoksa baglanti
  // titremesi calisan adminleri panelden atar.
  okTrue("uyelik", "ag hatasinda cikis YOK", code.includes("if (error) return;"), MEMBER);
  okTrue("uyelik", "yalniz KESIN cevapta cikis", code.includes("if (data) return;"), MEMBER);
  okTrue("uyelik", "cikis /admin/yetkisiz'e", code.includes('window.location.replace("/admin/yetkisiz")'), MEMBER);
  // Tam yenileme: sunucu layout'u da ayni karari versin
  okTrue("uyelik", "tam yenileme (router.push degil)", !code.includes("router.push"), MEMBER);
  // Ag turu olmayan oturum okumasi (her gezinmede getUser() pahali olurdu)
  okTrue("uyelik", "getSession (yerel) kullaniliyor", code.includes("auth.getSession()"), MEMBER);
  okTrue("uyelik", "getUser (ag turu) kullanilmiyor", !code.includes("auth.getUser()"), MEMBER);
  // Layout ile AYNI olcut: bu kullanici bu kurumun uyesi mi
  okTrue("uyelik", "layout ile ayni olcut", code.includes('.eq("user_id", session.user.id)') && code.includes('.eq("tenant_id", tenant.id)'), MEMBER);
  // Cift yonlendirme korumasi
  okTrue("uyelik", "tek sefer tetiklenir", code.includes("leavingRef"), MEMBER);

  const shell = stripComments(read(SHELL));
  okTrue("uyelik", "AdminShell'e bagli", shell.includes("<MembershipGuard>{children}</MembershipGuard>"), SHELL);
}

// ---------------------------------------------------------------------------
header("(c) 🔴 KAPSAM KILIDI — dosya basina yazma sayilari");
// ---------------------------------------------------------------------------
{
  // Her satir: [dosya, sarili, toplam delete, toplam update]
  // Sarilmamis = (delete + update) - sarili. Bunlar BILINCLI istisnalar:
  // temizlik silmeleri (0 satir DOGRU olabilir) ve arka plan guncellemeleri
  // (kullaniciya basari mesaji gosterilmiyor).
  //
  // 🔴 Yeni bir UPDATE/DELETE eklenirse bu tablo KIRILIR — ekleyen kisi
  // yazmayi siniflandirmak ZORUNDA kalir. Kirilmasi istenen davranistir.
  const BEKLENEN = [
    ["anasayfa-bolumleri/[id]/page.tsx", 3, 1, 2],
    ["anasayfa-bolumleri/page.tsx",      4, 1, 3],
    ["duyurular/[id]/page.tsx",          1, 2, 3],
    ["duyurular/page.tsx",               1, 2, 0],
    ["galeri/[id]/page.tsx",             4, 1, 3],
    ["galeri/page.tsx",                  3, 1, 2],
    ["gelen-mesajlar/page.tsx",          1, 1, 1],
    ["haberler/[id]/page.tsx",           1, 2, 3],
    ["haberler/page.tsx",                1, 2, 0],
    ["kategoriler/page.tsx",             4, 1, 3],
    ["manset/page.tsx",                  4, 1, 3],
    ["menu/page.tsx",                    4, 1, 3],
    ["sayfalar/[id]/page.tsx",           1, 1, 2],
    ["sayfalar/page.tsx",                1, 1, 0],
    ["slider/page.tsx",                  4, 1, 3],
    ["subeler/page.tsx",                 4, 1, 3],
    ["yonetim-kurulu/page.tsx",          4, 1, 3],
  ];

  const say = (s, re) => (s.match(re) || []).length;
  let sariliToplam = 0;
  let yazmaToplam = 0;

  for (const [dosya, w, d, u] of BEKLENEN) {
    const src = read(`${ADMIN}/${dosya}`);
    ok("kapsam", `${dosya}: sarili`, say(src, /verifyWrite\(/g), w, dosya);
    ok("kapsam", `${dosya}: delete`, say(src, /\.delete\(\)/g), d, dosya);
    ok("kapsam", `${dosya}: update`, say(src, /\.update\(/g), u, dosya);
    sariliToplam += w;
    yazmaToplam += d + u;
  }

  ok("kapsam", "TOPLAM sarilan yazma", sariliToplam, 45, "45 = 14 silme + 31 guncelleme");
  ok("kapsam", "TOPLAM yazma", yazmaToplam, 58, "21 delete + 37 update");
  ok("kapsam", "bilincli sarilmamis", yazmaToplam - sariliToplam, 13, "temizlik + arka plan");

  // Panelde verifyWrite kullanan dosya sayisi
  const tsxDosyalar = [];
  const gez = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) gez(full);
      else if (e.name.endsWith(".tsx")) tsxDosyalar.push(full);
    }
  };
  gez(ADMIN);
  const sariliDosya = tsxDosyalar.filter((f) => read(f).includes("verifyWrite("));
  ok("kapsam", "verifyWrite kullanan dosya", sariliDosya.length, 17, ADMIN);
  for (const f of sariliDosya) {
    okTrue("kapsam", `import var: ${f.split("/").pop()}`, read(f).includes('from "@/lib/write-guard"'), f);
  }
}

// ---------------------------------------------------------------------------
header("(d) Bilincli SARILMAMIS yazmalar — 0 satir DOGRU olabilir");
// ---------------------------------------------------------------------------
{
  // Temizlik silmeleri: haber/duyuru silinince manset ve content_media
  // temizligi. Icerik zaten mansette DEGILSE 0 satir BEKLENEN sonuctur;
  // dogrulamak SAHTE HATA uretirdi.
  for (const [dosya, tablo] of [
    ["haberler/page.tsx", "headlines"],
    ["duyurular/page.tsx", "headlines"],
    ["haberler/[id]/page.tsx", "content_media"],
    ["duyurular/[id]/page.tsx", "content_media"],
    ["sayfalar/[id]/page.tsx", "content_media"],
  ]) {
    const src = read(`${ADMIN}/${dosya}`);
    const i = src.indexOf(`.from("${tablo}")`);
    okTrue(
      "istisna",
      `${dosya} ${tablo} temizligi sarilmamis`,
      i !== -1 && !src.slice(Math.max(0, i - 200), i).includes("verifyWrite("),
      `${dosya}/${tablo}`
    );
  }

  // Arka plan: "okundu" isaretleme — kullaniciya basari mesaji YOK
  const mesajlar = read(`${ADMIN}/gelen-mesajlar/page.tsx`);
  const j = mesajlar.indexOf(".update({ okundu: true })");
  okTrue("istisna", "okundu isaretlemesi sarilmamis", j !== -1 && !mesajlar.slice(j - 200, j).includes("verifyWrite("), "gelen-mesajlar");

  // lib/storage.ts content_media purge — temizlik, sarilmamali
  const storage = read("src/lib/storage.ts");
  okTrue("istisna", "storage content_media purge sarilmamis", !storage.includes("verifyWrite"), "lib/storage.ts");

  // INSERT / UPSERT sarilmamali: RLS onlari ZATEN hata ile reddediyor
  const ayarlar = read(`${ADMIN}/ayarlar/page.tsx`);
  okTrue("istisna", "ayarlar upsert sarilmamis", !ayarlar.includes("verifyWrite"), "ayarlar");
  const ozet = read(`${ADMIN}/page.tsx`);
  okTrue("istisna", "ozet upsert sarilmamis", !ozet.includes("verifyWrite"), "ozet");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
