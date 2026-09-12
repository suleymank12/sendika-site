// @ts-check
/**
 * test-healthchecks.mjs — scripts/lib/healthchecks.mjs testi (ağ YOK)
 * ---------------------------------------------------------------------------
 * ÇALIŞTIRMA: npm run test:healthchecks
 *
 * Bu dosya backup-storage.mjs'in kullandığı ping katmanını kilitler.
 * backup-db.sh'ın bash ayrıştırıcısı ayrı testte (test-backup-db.sh bölüm h)
 * — İKİSİ AYNI DOSYA BİÇİMİNİ okur, o yüzden buradaki biçim fikstürleriyle
 * oradakiler bilerek eşleştirildi (tırnak, boşluk, CRLF, sonuncu kazanır).
 *
 * NE DOĞRULANIR:
 *   (a) adres çözümü: ortam değişkeni > dosya; tırnak/boşluk/CRLF/yorum;
 *       sonuncu anahtar kazanır; sondaki '/' kırpılır
 *   (b) reddetme: dosya yok, anahtar yok, değer boş, https değil → url null
 *   (c) gevşek izin (644) → UYARI ama adres YİNE kullanılır
 *   (d) ping: POST, adres = url + sonEk, gövde gönderilir, zaman aşımı var
 *   (e) DAYANIKLILIK: fetch throw etse, HTTP 500 dönse, zaman aşsa bile
 *       pingAt THROW ETMEZ — yalnız gonderildi=false döner (yedek geçerli)
 *   (f) yeniden deneme: ilk deneme düşer, ikincisi tutar → gonderildi=true
 *   (g) url null → hiç istek yapılmaz
 */

import {
  pingAdresiCoz,
  pingAt,
  satirdanOku,
  HC_VARSAYILAN_DOSYA,
} from "./lib/healthchecks.mjs";

const URL_1 = "https://hc-ping.com/00000000-1111-2222-3333-444444444444";
const URL_2 = "https://hc-ping.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let gecti = 0;
let kaldi = 0;

function ok(ad, cikti, beklenen) {
  if (cikti === beklenen) {
    gecti++;
    console.log(`  PASS  ${ad}`);
  } else {
    kaldi++;
    console.log(`  FAIL  ${ad}`);
    console.log(`          çıktı : ${JSON.stringify(cikti)}`);
    console.log(`          bekle : ${JSON.stringify(beklenen)}`);
  }
}

function icerir(ad, metin, parca) {
  ok(ad, String(metin).includes(parca) ? "var" : `yok (${metin})`, "var");
}

/** Sahte dosya sistemi: { yol: içerik } */
function sahteOku(dosyalar) {
  return (yol) => (yol in dosyalar ? dosyalar[yol] : null);
}

// ---------------------------------------------------------------------------
console.log("\n(a) Adres çözümü\n");
{
  const YOL = "/root/healthchecks.env";
  const coz = (icerik, env = {}, izin = () => 0o600) =>
    pingAdresiCoz({
      anahtar: "HC_URL_DB",
      env,
      dosyaYolu: YOL,
      oku: sahteOku({ [YOL]: icerik }),
      izin,
    });

  ok("düz satır", coz(`HC_URL_DB=${URL_1}\n`).url, URL_1);
  ok(
    "diğer anahtarlar karışmaz",
    coz(`HC_URL_STORAGE=${URL_2}\nHC_URL_DB=${URL_1}\n`).url,
    URL_1
  );
  ok("çift tırnak", coz(`HC_URL_DB="${URL_1}"\n`).url, URL_1);
  ok("tek tırnak", coz(`HC_URL_DB='${URL_1}'\n`).url, URL_1);
  ok(
    "baştaki/sondaki boşluk + '=' çevresi",
    coz(`   HC_URL_DB   =   ${URL_1}   \n`).url,
    URL_1
  );
  ok("CRLF satır sonu", coz(`HC_URL_DB=${URL_1}\r\n`).url, URL_1);
  ok("yorum satırı atlanır", coz(`# HC_URL_DB=${URL_2}\nHC_URL_DB=${URL_1}\n`).url, URL_1);
  ok(
    "aynı anahtar iki kez → SONUNCU kazanır",
    coz(`HC_URL_DB=${URL_2}\nHC_URL_DB=${URL_1}\n`).url,
    URL_1
  );
  ok("sondaki '/' kırpılır", coz(`HC_URL_DB=${URL_1}/\n`).url, URL_1);
  ok(
    "ortam değişkeni dosyayı EZER (elle test)",
    coz(`HC_URL_DB=${URL_1}\n`, { HC_URL_DB: URL_2 }).url,
    URL_2
  );
  ok(
    "boş ortam değişkeni dosyayı ezmez",
    coz(`HC_URL_DB=${URL_1}\n`, { HC_URL_DB: "  " }).url,
    URL_1
  );
  ok(
    "HEALTHCHECKS_ENV yolu değiştirir",
    pingAdresiCoz({
      anahtar: "HC_URL_DB",
      env: { HEALTHCHECKS_ENV: "/tmp/baska.env" },
      oku: sahteOku({ "/tmp/baska.env": `HC_URL_DB=${URL_1}\n` }),
      izin: () => 0o600,
    }).url,
    URL_1
  );
  ok("varsayılan yol /root/healthchecks.env", HC_VARSAYILAN_DOSYA, "/root/healthchecks.env");
  ok("satırdanOku: değer yoksa null", satirdanOku("HC_URL_DB=\n", "HC_URL_DB"), null);
}

// ---------------------------------------------------------------------------
console.log("\n(b) Reddetme — url null + not\n");
{
  const YOL = "/root/healthchecks.env";
  const bos = pingAdresiCoz({
    anahtar: "HC_URL_DB",
    env: {},
    dosyaYolu: YOL,
    oku: () => null,
    izin: () => null,
  });
  ok("dosya yok → url null", bos.url, null);
  icerir("dosya yok → not", bos.notlar.join("|"), "DEVRE DIŞI");

  const coz = (icerik) =>
    pingAdresiCoz({
      anahtar: "HC_URL_DB",
      env: {},
      dosyaYolu: YOL,
      oku: sahteOku({ [YOL]: icerik }),
      izin: () => 0o600,
    });

  const anahtarYok = coz(`HC_URL_STORAGE=${URL_2}\n`);
  ok("anahtar yok → url null (diğerinin adresi KULLANILMAZ)", anahtarYok.url, null);
  icerir("anahtar yok → not", anahtarYok.notlar.join("|"), "DEVRE DIŞI");

  ok("değer boş → url null", coz("HC_URL_DB=\n").url, null);

  const http = coz("HC_URL_DB=http://hc-ping.com/duz\n");
  ok("http:// → url null", http.url, null);
  icerir("http:// → uyarı", http.notlar.join("|"), "https:// ile başlamıyor");

  const sacma = coz("HC_URL_DB=rm -rf /\n");
  ok("adres gibi olmayan değer → url null", sacma.url, null);
}

// ---------------------------------------------------------------------------
console.log("\n(c) Gevşek izin → uyarı, ama adres kullanılır\n");
{
  const YOL = "/root/healthchecks.env";
  const coz = (mod) =>
    pingAdresiCoz({
      anahtar: "HC_URL_DB",
      env: {},
      dosyaYolu: YOL,
      oku: sahteOku({ [YOL]: `HC_URL_DB=${URL_1}\n` }),
      izin: () => mod,
    });

  const gevsek = coz(0o644);
  ok("644 → adres YİNE kullanılır", gevsek.url, URL_1);
  icerir("644 → uyarı", gevsek.notlar.join("|"), "izni 644 — 600 olmalı");
  ok("600 → uyarı yok", coz(0o600).notlar.length, 0);
  ok("400 → uyarı yok", coz(0o400).notlar.length, 0);
  ok("izin okunamadı (null) → uyarı yok", coz(null).notlar.length, 0);
}

// ---------------------------------------------------------------------------
console.log("\n(d) Ping — istek biçimi\n");
{
  const cagrilar = [];
  const sahteFetch = async (adres, opt) => {
    cagrilar.push({ adres, opt });
    return { ok: true, status: 200 };
  };

  const basari = await pingAt({
    url: URL_1,
    govde: "durum=OK dosya=yedek.dump",
    fetchImpl: /** @type {any} */ (sahteFetch),
  });
  ok("başarı → gonderildi", basari.gonderildi, true);
  ok("tek istek", cagrilar.length, 1);
  ok("adres = url (son ek yok)", cagrilar[0].adres, URL_1);
  ok("yöntem POST", cagrilar[0].opt.method, "POST");
  ok("gövde gönderildi", cagrilar[0].opt.body, "durum=OK dosya=yedek.dump");
  ok("zaman aşımı sinyali var", Boolean(cagrilar[0].opt.signal), true);
  icerir("ping notu", basari.notlar.join("|"), "ping gönderildi");

  const hataPing = await pingAt({
    url: URL_1,
    sonEk: "/fail",
    govde: "durum=HATA sebep=auth users verisi yok",
    fetchImpl: /** @type {any} */ (sahteFetch),
  });
  ok("/fail → gonderildi", hataPing.gonderildi, true);
  ok("/fail adresi", cagrilar[1].adres, `${URL_1}/fail`);
  icerir("/fail notu", hataPing.notlar.join("|"), "(/fail)");

  const uzun = await pingAt({
    url: URL_1,
    govde: "x".repeat(50_000),
    fetchImpl: /** @type {any} */ (sahteFetch),
  });
  ok("çok uzun gövde kırpılır", cagrilar[2].opt.body.length, 10_000);
  ok("kırpma başarıyı bozmaz", uzun.gonderildi, true);
}

// ---------------------------------------------------------------------------
console.log("\n(e) Dayanıklılık — ping ASLA throw etmez\n");
{
  const bekletme = [];
  const beklet = async (ms) => {
    bekletme.push(ms);
  };

  const patla = await pingAt({
    url: URL_1,
    fetchImpl: /** @type {any} */ (async () => {
      throw new Error("getaddrinfo ENOTFOUND hc-ping.com");
    }),
    beklet,
  });
  ok("ağ hatası → throw YOK, gonderildi=false", patla.gonderildi, false);
  icerir("ağ hatası → not", patla.notlar.join("|"), "GÖNDERİLEMEDİ");
  icerir("ağ hatası → sebep notta", patla.notlar.join("|"), "ENOTFOUND");
  icerir(
    "not 'yedek etkilenmez' diyor",
    patla.notlar.join("|"),
    "yedeğin sonucu bundan etkilenmez"
  );
  ok("3 deneme yapıldı (2 ara bekleme)", bekletme.length, 2);

  const besYuz = await pingAt({
    url: URL_1,
    fetchImpl: /** @type {any} */ (async () => ({ ok: false, status: 500 })),
    beklet,
  });
  ok("HTTP 500 → gonderildi=false", besYuz.gonderildi, false);
  icerir("HTTP 500 → sebep notta", besYuz.notlar.join("|"), "HTTP 500");

  const zamanAsimi = await pingAt({
    url: URL_1,
    fetchImpl: /** @type {any} */ (async () => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    }),
    beklet,
  });
  ok("zaman aşımı → gonderildi=false", zamanAsimi.gonderildi, false);

  const bozuk = await pingAt({
    url: URL_1,
    fetchImpl: /** @type {any} */ (async () => null),
    beklet,
  });
  ok("fetch saçma değer döndü → throw YOK", bozuk.gonderildi, false);
}

// ---------------------------------------------------------------------------
console.log("\n(f) Yeniden deneme — tek ağ hıçkırığı sahte alarma dönmesin\n");
{
  let n = 0;
  const sonuc = await pingAt({
    url: URL_1,
    fetchImpl: /** @type {any} */ (async () => {
      n++;
      if (n === 1) throw new Error("ECONNRESET");
      return { ok: true, status: 200 };
    }),
    beklet: async () => {},
  });
  ok("ilk deneme düştü, ikincisi tuttu → gonderildi", sonuc.gonderildi, true);
  ok("iki deneme yapıldı", n, 2);
  ok("başarıda uyarı notu yok", sonuc.notlar.join("|").includes("GÖNDERİLEMEDİ"), false);
}

// ---------------------------------------------------------------------------
console.log("\n(g) Adres yoksa hiç istek yapılmaz\n");
{
  let cagrildi = false;
  const sonuc = await pingAt({
    url: null,
    fetchImpl: /** @type {any} */ (async () => {
      cagrildi = true;
      return { ok: true, status: 200 };
    }),
  });
  ok("url null → fetch çağrılmadı", cagrildi, false);
  ok("url null → gonderildi=false", sonuc.gonderildi, false);
  ok("url null → not yok (uyarı adres çözümünde verildi)", sonuc.notlar.length, 0);
}

// ---------------------------------------------------------------------------
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı\n`);
process.exit(kaldi === 0 ? 0 : 1);
