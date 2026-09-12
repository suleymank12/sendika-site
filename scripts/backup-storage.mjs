/**
 * Storage Yedegi — 'images' bucket'ini yerel diske aynalar
 * ---------------------------------------------------------
 * NEDEN VAR: /usr/local/bin/supabase-yedek.sh yalnizca VERITABANINI yedekler.
 * Storage dosyalari (haber kapaklari, galeri, logo, video) o dokumun ICINDE
 * DEGILDIR. Bucket public-read ve VERSIYONLAMA YOK — silinen bir gorsel geri
 * gelmez. Bu script o boslugu kapatir.
 *
 * KULLANIM:
 *   node scripts/backup-storage.mjs /var/backups/storage
 *   node scripts/backup-storage.mjs            # hedef verilmezse ./storage-backup
 *
 * NE YAPAR:
 *   1) Bucket'taki TUM dosyalari listeler (rekursif + sayfalamali)
 *   2) Hedefe {tenant_id}/{klasor}/{dosya} yapisini AYNEN indirir
 *   3) ARTIMLI: yerelde ayni isim + ayni boyut varsa tekrar indirmez
 *   4) Storage'dan silinmis ama yerelde duran dosyalari SILMEZ —
 *      _silinenler/{tarih}/ altina tasir (bkz. asagidaki karar)
 *   5) _silinenler icinde SAKLAMA_GUN gununden eski klasorleri temizler
 *   6) Hedef dizine yedek.log'a tarihli ozet satiri yazar
 *
 * CIKIS KODU: tek dosya bile inemezse 1 (cron log'unda gorunur), aksi halde 0.
 *
 * =========================================================================
 * KARAR 1 — ARTIMLI KARSILASTIRMA: uzak metadata.size <-> yerel dosya boyutu
 * =========================================================================
 * Karsilastirma iki tarafin BOYUTU uzerinden yapilir: uzak taraf list()
 * cevabindaki metadata.size, yerel taraf statSync().size.
 *
 * Neden bu ikisi:
 *   - metadata.size listeleme cevabiyla BEDAVA gelir; dosya basina ek HEAD/
 *     GET istegi gerekmez. 124 dosyada fark kucuk, ama bu script buyudukce
 *     tek fark yaratan sey istek sayisi olur.
 *   - Yerel tarafta yalnizca "dosya var mi" bakmak YETMEZ: yarim kalmis bir
 *     indirme (cron sirasinda ag koptu) diskte bozuk/kirpik bir dosya birakir
 *     ve varlik kontrolu onu "yedeklenmis" sayar. Boyut kontrolu bunu yakalar.
 *   - Ek onlem: indirme once .part uzantisina yazilir, bittikten SONRA
 *     rename edilir. Yani nihai yolda hicbir zaman yarim dosya olusmaz;
 *     boyut kontrolu de bu sayede guvenilir bir imza haline gelir.
 *
 * metadata.size yoksa/0 ise dosya HER ZAMAN yeniden indirilir (fail-safe:
 * bilinmeyen durumda yedegi tazele, atlama).
 *
 * REDDEDILEN ALTERNATIF — eTag/MD5 karsilastirmasi:
 *   metadata.eTag mevcut ve icerik degisikligini boyuttan daha iyi yakalar.
 *   Kullanilmadi cunku S3 uyumlu depolamada multipart yuklemelerde eTag ham
 *   MD5 DEGILDIR ("<md5>-<parca>" formatinda olur). O durumda yerel MD5 ile
 *   asla eslesmez ve script her gece TUM dosyalari yeniden indirir — sessizce
 *   calisir ama artimli olma ozelligini kaybeder. Boyut esitligi bu ortamda
 *   daha dusuk riskli.
 *   Kabul edilen sinir: ayni isimde, ayni boyutta ama ICERIGI degismis bir
 *   dosya atlanir. Bu uygulamada dosya adlari zaman damgali uretiliyor
 *   ({timestamp}-{rastgele}.webp) ve ayni yola tekrar yazilmiyor — yani
 *   "ayni ad + ayni boyut + farkli icerik" pratikte olusmuyor.
 *
 * =========================================================================
 * KARAR 2 — SILINEN DOSYALAR: silme yok, _silinenler/{tarih}/ altina tasi
 * =========================================================================
 * Storage'dan silinmis ama yerelde duran dosya SILINMEZ; hedef dizindeki
 * _silinenler/{YYYY-AA-GG}/ altina, orijinal yolu korunarak tasinir ve
 * SAKLAMA_GUN gun sonra temizlenir.
 *
 * Neden birebir ayna (silme) DEGIL:
 *   Yedegin varlik sebebi kazara silmeden donmek. Ayna mantiginda kazara
 *   silinen bir gorsel, ILK gece yedekten de silinir — yani yedek tam da
 *   korumasi gereken senaryoda ise yaramaz. Bucket'ta versiyonlama olmadigi
 *   icin bu kayip kalicidir.
 *
 * Neden sonsuza kadar tutmak DEGIL:
 *   Yerel kopya bir daha hic temizlenmezse yedek dizini surekli buyur ve
 *   "neyin ne zaman silindigi" bilgisi kaybolur. Tarihli klasor hem sinirli
 *   buyume hem de silinme gunlugu saglar.
 *
 * SAKLAMA_GUN neden 30 (DB yedegi 14 iken):
 *   DB tarafinda her gece TAM dokum aliniyor — 14 gunluk pencerede silinen
 *   bir satir 14 ayri dosyanin icinde duruyor. Storage tarafinda ise tek bir
 *   canli ayna var; _silinenler o kaybin TEK kaydi. Tek kayit oldugu ve
 *   silinen gorsel geri getirilemedigi icin pencere daha genis tutuldu.
 *   Maliyet ihmal edilebilir: yalnizca silinmis dosyalari tutar.
 *
 * BEKLENEN ILK KULLANIM: goc sonrasi kalan 48 prefix'siz dosya yakinda
 * silinecek. Bu script onlari once normal sekilde yedekler; silindikten
 * sonraki ilk kosumda _silinenler/{tarih}/ altina tasir ve 30 gun tutar.
 *
 * =========================================================================
 * KARAR 3 — BASARI SINYALI (dead-man's switch, 12 Eylul 2026)
 * =========================================================================
 * Kosum basariyla biterse Healthchecks.io'ya ping atilir; 25 saat (1 gun +
 * 1 saat grace) ping gelmezse e-posta gelir. "Hata olunca bildir" YETMEZ:
 * cron hic calismazsa hata da olusmaz, log satiri da yazilmaz.
 *
 * HATADA /fail: gerekce, ping ATMAMAK zaten 25 saat sonra alarm demektir;
 * /fail ayni alarmi HEMEN ve SEBEBIYLE verir. Iki hata turu de /fail atar:
 *   - olumcul hata (listeleme/baglanti): ayna guvenilir degil
 *   - tek tek dosya hatalari (hata > 0): ayna EKSIK; cikis kodu zaten 1
 *
 * ADRES REPODA DURMAZ (adresi bilen sahte "basarili" ping atip alarmi
 * susturabilir) — sunucuda /root/healthchecks.env, izin 600:
 *     HC_URL_STORAGE=https://hc-ping.com/<uuid>
 * Ayrintili gerekce ve ayristirma kurallari: scripts/lib/healthchecks.mjs.
 *
 * Ping YAN IS: adres yoksa, ag yoksa, Healthchecks kapaliysa yalniz konsola
 * not dusulur — yedegin sonucu ve cikis kodu DEGISMEZ.
 */

import { createClient } from "@supabase/supabase-js";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  unlinkSync,
  createWriteStream,
  appendFileSync,
} from "fs";
import { join, dirname, resolve, posix } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { pingAdresiCoz, pingAt } from "./lib/healthchecks.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ortam degiskeni yukleyici (dotenv paketi gerektirmez)
// Lokalde .env.local, VPS'te .env — ikisini de destekler.
// ---------------------------------------------------------------------------
function loadEnv() {
  const adaylar = [
    join(__dirname, "..", ".env.local"),
    join(__dirname, "..", ".env"),
  ];
  const bulunan = adaylar.find((p) => existsSync(p));
  if (!bulunan) {
    console.error(`HATA: ortam dosyasi bulunamadi. Denenen yollar:`);
    adaylar.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  const raw = readFileSync(bulunan, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return bulunan;
}

const ENV_DOSYASI = loadEnv();

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const BUCKET = "images";
const HEDEF = resolve(process.argv[2] || join(process.cwd(), "storage-backup"));
const SILINENLER_DIZIN = "_silinenler";
const LOG_DOSYASI = "yedek.log";
const SAKLAMA_GUN = 30; // _silinenler icin (gerekce: dosya basi karar notu)
const SAYFA = 100; // storage.list() sayfa boyutu
const IMZALI_URL_SANIYE = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    `HATA: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik (${ENV_DOSYASI})`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------
function insanBoyut(bayt) {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
  if (bayt < 1024 * 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
  return `${(bayt / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function bugununTarihi() {
  return new Date().toISOString().slice(0, 10); // YYYY-AA-GG
}

/**
 * Healthchecks ping'i (KARAR 3). Adres bir kez cozulur; hicbir kosulda
 * throw etmez, cagiranin cikis kodunu etkilemez.
 * @param {"" | "/fail"} sonEk
 * @param {string} govde
 */
let hcAdres = null;
async function hcPing(sonEk, govde) {
  const yaz = (n) => console.log(`  [HEALTHCHECKS] ${n}`);
  try {
    if (!hcAdres) {
      hcAdres = pingAdresiCoz({ anahtar: "HC_URL_STORAGE" });
      hcAdres.notlar.forEach(yaz);
    }
    const { notlar } = await pingAt({ url: hcAdres.url, sonEk, govde });
    notlar.forEach(yaz);
  } catch (err) {
    // pingAt throw etmez; yine de yan is asil isi cokertmesin.
    yaz(`UYARI: ping katmani hata verdi: ${err instanceof Error ? err.message : err}`);
  }
}

/** Uzak yolu ({tenant}/{klasor}/{dosya}) yerel mutlak yola cevirir. */
function yerelYol(kok, uzakYol) {
  return join(kok, ...uzakYol.split("/"));
}

/**
 * Bucket'taki TUM dosyalari rekursif listeler.
 *
 * storage.list() rekursif DEGIL ve sayfalidir. Iki tuzak:
 *   1) Klasorler ayri kayit olarak doner (id === null) — icine dalmak gerekir.
 *   2) Sunucu istenen limit'ten AZ kayit dondurebilir. Bu yuzden dongu
 *      "data.length < limit ise bitti" varsayimini KULLANMAZ — yalnizca BOS
 *      sayfa gelince durur ve offset'i donen kayit sayisi kadar ilerletir.
 *      (Aksi halde sunucu tarafli bir limit sessizce dosya atlatirdi; yedek
 *      script'inde bu, fark edilmeyen veri kaybi demektir.)
 */
async function tumDosyalariListele(prefix = "") {
  const sonuc = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, {
        limit: SAYFA,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw new Error(`list('${prefix || "/"}') hatasi: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const item of data) {
      // Supabase bos klasorler icin yer tutucu nesne yaratir — dosya degil.
      if (item.name === ".emptyFolderPlaceholder") continue;

      const tamYol = prefix ? `${posix.join(prefix, item.name)}` : item.name;

      if (item.id === null) {
        // Klasor — icine dal
        const altlar = await tumDosyalariListele(tamYol);
        sonuc.push(...altlar);
      } else {
        sonuc.push({
          yol: tamYol,
          boyut: item.metadata?.size ?? null,
        });
      }
    }

    offset += data.length;
  }

  return sonuc;
}

/**
 * Yedek dizinindeki mevcut dosyalari (uzak yol formatinda) listeler.
 * _silinenler/ ve log dosyasi haric tutulur; yarim kalmis .part dosyalari
 * ayri toplanir (silinecekler).
 */
function yereldekiDosyalar(kok) {
  const dosyalar = new Set();
  const yarimlar = [];

  function gez(mutlak, goreli) {
    let girisler;
    try {
      girisler = readdirSync(mutlak, { withFileTypes: true });
    } catch {
      return;
    }
    for (const giris of girisler) {
      const altMutlak = join(mutlak, giris.name);
      const altGoreli = goreli ? `${goreli}/${giris.name}` : giris.name;

      // Arsiv ve log yedegin "aynasi" degil — kiyaslamaya girmemeli
      if (!goreli && (giris.name === SILINENLER_DIZIN || giris.name === LOG_DOSYASI)) {
        continue;
      }

      if (giris.isDirectory()) {
        gez(altMutlak, altGoreli);
      } else if (giris.isFile()) {
        if (giris.name.endsWith(".part")) yarimlar.push(altMutlak);
        else dosyalar.add(altGoreli);
      }
    }
  }

  if (existsSync(kok)) gez(kok, "");
  return { dosyalar, yarimlar };
}

/** Tek dosyayi indirir: .part'a yaz -> rename. Yarim dosya birakmaz. */
async function dosyaIndir(uzakYol, hedefYol) {
  mkdirSync(dirname(hedefYol), { recursive: true });
  const gecici = `${hedefYol}.part`;

  try {
    // Imzali URL: bucket public olsa da olmasa da ayni kod yolu calisir.
    // download() yerine stream: buyuk video dosyalari bellege alinmaz.
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(uzakYol, IMZALI_URL_SANIYE);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "imzali URL alinamadi");
    }

    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error("bos yanit govdesi");

    await pipeline(Readable.fromWeb(res.body), createWriteStream(gecici));
    renameSync(gecici, hedefYol);

    return statSync(hedefYol).size;
  } catch (err) {
    // Yarim dosyayi birakma
    try {
      if (existsSync(gecici)) unlinkSync(gecici);
    } catch {
      /* temizlik basarisiz olsa da asil hatayi bildir */
    }
    throw err;
  }
}

/** Storage'dan silinmis dosyayi _silinenler/{tarih}/ altina tasir. */
function arsiveTasi(kok, goreliYol) {
  const kaynak = yerelYol(kok, goreliYol);
  const hedef = join(kok, SILINENLER_DIZIN, bugununTarihi(), ...goreliYol.split("/"));
  mkdirSync(dirname(hedef), { recursive: true });

  // Ayni gun ikinci kez calisirsa hedef zaten olabilir — uzerine yaz.
  if (existsSync(hedef)) rmSync(hedef, { force: true });
  renameSync(kaynak, hedef);
}

/** SAKLAMA_GUN gununden eski _silinenler/{tarih} klasorlerini siler. */
function arsiviTemizle(kok) {
  const arsivKok = join(kok, SILINENLER_DIZIN);
  if (!existsSync(arsivKok)) return { silinenKlasor: 0, silinenDosya: 0 };

  const simdi = Date.now();
  const sinir = SAKLAMA_GUN * 24 * 60 * 60 * 1000;
  let silinenKlasor = 0;
  let silinenDosya = 0;

  for (const giris of readdirSync(arsivKok, { withFileTypes: true })) {
    if (!giris.isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giris.name)) continue; // beklenmeyen isim: dokunma

    const tarih = Date.parse(`${giris.name}T00:00:00Z`);
    if (Number.isNaN(tarih)) continue;
    if (simdi - tarih <= sinir) continue;

    const klasor = join(arsivKok, giris.name);
    silinenDosya += yereldekiDosyalar(klasor).dosyalar.size;
    rmSync(klasor, { recursive: true, force: true });
    silinenKlasor++;
    console.log(`  [ARSIV TEMIZ] ${giris.name} (${SAKLAMA_GUN} gunden eski)`);
  }

  return { silinenKlasor, silinenDosya };
}

// ---------------------------------------------------------------------------
// Ana akis
// ---------------------------------------------------------------------------
async function main() {
  const basladi = Date.now();

  console.log("=".repeat(70));
  console.log("Storage Yedegi");
  console.log(`Bucket : ${BUCKET}`);
  console.log(`Hedef  : ${HEDEF}`);
  console.log(`Ortam  : ${ENV_DOSYASI}`);
  console.log("=".repeat(70));

  mkdirSync(HEDEF, { recursive: true });

  // 1) Uzak dosyalar
  console.log("\n[1/4] Bucket listeleniyor...");
  const uzaktakiler = await tumDosyalariListele();
  const uzakToplamBayt = uzaktakiler.reduce((t, d) => t + (d.boyut || 0), 0);
  console.log(
    `  ${uzaktakiler.length} dosya bulundu (${insanBoyut(uzakToplamBayt)})`
  );

  // 2) Indirme (artimli)
  console.log("\n[2/4] Dosyalar indiriliyor (artimli)...");
  let indirilen = 0;
  let atlanan = 0;
  let hata = 0;
  let indirilenBayt = 0;
  const hataListesi = [];

  for (const dosya of uzaktakiler) {
    const hedefYol = yerelYol(HEDEF, dosya.yol);

    // Artimli kontrol: ayni isim + ayni boyut -> atla.
    // Uzak boyut bilinmiyorsa (metadata.size yok) fail-safe: yeniden indir.
    if (dosya.boyut && existsSync(hedefYol)) {
      let yerelBoyut = -1;
      try {
        const st = statSync(hedefYol);
        if (st.isFile()) yerelBoyut = st.size;
      } catch {
        yerelBoyut = -1;
      }
      if (yerelBoyut === dosya.boyut) {
        atlanan++;
        continue;
      }
    }

    try {
      const bayt = await dosyaIndir(dosya.yol, hedefYol);
      indirilen++;
      indirilenBayt += bayt;
      console.log(`  [OK] ${dosya.yol} (${insanBoyut(bayt)})`);
    } catch (err) {
      hata++;
      const mesaj = err instanceof Error ? err.message : String(err);
      hataListesi.push({ yol: dosya.yol, mesaj });
      console.error(`  [HATA] ${dosya.yol}: ${mesaj}`);
      // Tek dosya yedegi cokertmez — say ve devam et.
    }
  }

  console.log(
    `\n  Indirilen: ${indirilen}, Atlanan: ${atlanan}, Hata: ${hata}`
  );

  // 3) Storage'dan silinmis dosyalar -> arsive
  console.log("\n[3/4] Silinen dosyalar kontrol ediliyor...");
  const uzakKume = new Set(uzaktakiler.map((d) => d.yol));
  const { dosyalar: yereldekiler, yarimlar } = yereldekiDosyalar(HEDEF);

  // Onceki kosumdan kalmis yarim indirmeler
  for (const yarim of yarimlar) {
    try {
      unlinkSync(yarim);
      console.log(`  [TEMIZ] yarim dosya silindi: ${yarim}`);
    } catch {
      /* onemsiz */
    }
  }

  let arsivlenen = 0;
  // Listeleme hata verdiyse uzak kume EKSIK olabilir; o durumda dosyalari
  // "silinmis" sanip tasimak yanlis olur. Listeleme hatasi zaten fatal
  // (throw) oldugu icin buraya yalnizca saglam bir liste ile gelinir.
  for (const goreli of yereldekiler) {
    if (uzakKume.has(goreli)) continue;
    try {
      arsiveTasi(HEDEF, goreli);
      arsivlenen++;
      console.log(`  [ARSIV] ${goreli} -> ${SILINENLER_DIZIN}/${bugununTarihi()}/`);
    } catch (err) {
      hata++;
      const mesaj = err instanceof Error ? err.message : String(err);
      hataListesi.push({ yol: goreli, mesaj: `arsivleme: ${mesaj}` });
      console.error(`  [HATA] arsivleme ${goreli}: ${mesaj}`);
    }
  }
  if (arsivlenen === 0) console.log("  Silinen dosya yok.");

  const temizlik = arsiviTemizle(HEDEF);

  // 4) Ozet + log
  console.log("\n[4/4] Ozet yaziliyor...");
  const sureSn = Math.round((Date.now() - basladi) / 1000);
  const { dosyalar: sonDurum } = yereldekiDosyalar(HEDEF);
  let yedekBayt = 0;
  for (const goreli of sonDurum) {
    try {
      yedekBayt += statSync(yerelYol(HEDEF, goreli)).size;
    } catch {
      /* yarista silinmis olabilir */
    }
  }

  const logSatiri =
    `${new Date().toISOString()} | ` +
    `uzak=${uzaktakiler.length} ` +
    `indirilen=${indirilen} ` +
    `atlanan=${atlanan} ` +
    `arsivlenen=${arsivlenen} ` +
    `arsiv_temizlenen=${temizlik.silinenDosya} ` +
    `hata=${hata} ` +
    `indirilen_boyut=${insanBoyut(indirilenBayt)} ` +
    `yedek_boyut=${insanBoyut(yedekBayt)} ` +
    `sure=${sureSn}s`;

  try {
    appendFileSync(join(HEDEF, LOG_DOSYASI), logSatiri + "\n");
  } catch (err) {
    console.error(
      `  [HATA] log yazilamadi: ${err instanceof Error ? err.message : err}`
    );
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Uzaktaki dosya    : ${uzaktakiler.length} (${insanBoyut(uzakToplamBayt)})`);
  console.log(`Indirilen         : ${indirilen} (${insanBoyut(indirilenBayt)})`);
  console.log(`Atlanan (degismemis): ${atlanan}`);
  console.log(`Arsive tasinan    : ${arsivlenen}`);
  console.log(`Arsivden temizlenen: ${temizlik.silinenDosya} dosya / ${temizlik.silinenKlasor} klasor`);
  console.log(`Hata              : ${hata}`);
  console.log(`Yedek toplam      : ${sonDurum.size} dosya / ${insanBoyut(yedekBayt)}`);
  console.log(`Sure              : ${sureSn} sn`);

  if (hata > 0) {
    console.log("\nHATALI DOSYALAR:");
    for (const h of hataListesi) console.log(`  - ${h.yol}: ${h.mesaj}`);
  }
  console.log("=".repeat(70));

  // Basari sinyali EN SON (KARAR 3): hata varsa ayna EKSIK -> /fail.
  if (hata > 0) {
    const ilk = hataListesi[0];
    await hcPing(
      "/fail",
      `${logSatiri}\n\nIlk hata: ${ilk ? `${ilk.yol}: ${ilk.mesaj}` : "?"}`
    );
  } else {
    await hcPing("", logSatiri);
  }

  // Cron log'unda gorunsun diye hata varsa 1
  process.exitCode = hata > 0 ? 1 : 0;
}

main().catch(async (err) => {
  // Listeleme/baglanti gibi olumcul hatalar: yedek guvenilir degil.
  const mesaj = err instanceof Error ? err.message : String(err);
  console.error("OLUMCUL HATA:", mesaj);
  try {
    appendFileSync(
      join(HEDEF, LOG_DOSYASI),
      `${new Date().toISOString()} | OLUMCUL HATA: ${mesaj}\n`
    );
  } catch {
    /* log yazilamiyorsa da cikis kodu sinyali yeterli */
  }
  // Hemen alarm (KARAR 3) — ping bassa da dusse de cikis kodu 1.
  await hcPing("/fail", `OLUMCUL HATA: ${mesaj}`);
  process.exit(1);
});
