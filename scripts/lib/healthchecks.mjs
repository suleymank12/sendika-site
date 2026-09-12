// @ts-check
/**
 * Healthchecks.io başarı sinyali (dead-man's switch) — SAF mantık.
 * (12 Eylül 2026 — NOTE.md "✅ KAPATILDI — Yedek başarısızlığı bildirimi")
 *
 * NEDEN VAR: yedek script'leri sonucu yalnız log'a yazıyordu. "Hata olunca
 * bildir" YETMEZ — cron hiç çalışmazsa (sunucu kapalı, crontab silindi, disk
 * dolu) hata da oluşmaz, log satırı da yazılmaz; yedek haftalarca sessizce
 * durabilir. Çözüm ters yönlü: script BAŞARIYLA bitince harici bir adrese
 * ping atar; ping belirlenen sürede gelmezse Healthchecks e-posta atar.
 *
 * PING ADRESİ GİZLİDİR (adresi bilen sahte "başarılı" pingi atıp alarmı
 * susturabilir) → REPODA DURMAZ. Sunucuda:
 *
 *     /root/healthchecks.env   (sahibi root, izin 600)
 *     HC_URL_DB=https://hc-ping.com/<uuid>
 *     HC_URL_STORAGE=https://hc-ping.com/<uuid>
 *
 * Dosya SOURCE EDİLMEZ, satır satır ayrıştırılır (backup-db.sh'ın .pgpass
 * gerekçesiyle aynı: "env dosyasını source etmek" kod çalıştırma riskidir).
 * Aynı adlı ortam değişkeni dosyadan ÖNCE gelir — elle test için.
 *
 * ANA İŞİ BOZMAZ: ping yan iştir. Adres yoksa, curl/fetch patlarsa, ağ
 * yoksa, Healthchecks kapalıysa → yalnız not düşülür; yedek geçerli sayılır,
 * çıkış kodu değişmez. Bu dosyadaki hiçbir fonksiyon throw ETMEZ.
 *
 * Bash tarafı (backup-db.sh) aynı dosya biçimini kendi içinde ayrıştırır —
 * node'a bağımlı olmasın diye. İki ayrıştırıcı da aynı kurallara uyar:
 * satır başındaki boşluk serbest, `KEY=değer`, değer tırnaklı olabilir,
 * satır sonu CR atılır, aynı anahtar birden çok kez geçerse SONUNCU kazanır.
 *
 * Import'suz test edilebilirlik: dosya okuma, izin okuma, fetch ve bekleme
 * DIŞARIDAN verilebilir (scripts/test-healthchecks.mjs sahtelerle koşar).
 */

import { existsSync, readFileSync, statSync } from "node:fs";

/** Ping adreslerinin sunucudaki yeri (bkz. başlık). */
export const HC_VARSAYILAN_DOSYA = "/root/healthchecks.env";

/** Tek deneme için üst sınır — cron'u bekletmesin. */
export const HC_ZAMAN_ASIMI_MS = 10_000;

/** Deneme sayısı ve aralar: tek şanslı ağ hıçkırığı sahte alarma dönüşmesin. */
export const HC_DENEME = 3;
export const HC_DENEME_ARASI_MS = 2_000;

/** Gerçek dosya sistemi okuyucusu (test sahteyle değiştirir). */
export function dosyaOku(yol) {
  try {
    if (!existsSync(yol)) return null;
    return readFileSync(yol, "utf8");
  } catch {
    return null;
  }
}

/** Dosyanın 8'lik izin bitleri (600 → 0o600). Okunamazsa null. */
export function izinOku(yol) {
  try {
    return statSync(yol).mode & 0o777;
  } catch {
    return null;
  }
}

/**
 * Ping adresini çözer: önce ortam değişkeni, sonra dosya.
 *
 * @param {object} opt
 * @param {string} opt.anahtar - "HC_URL_DB" | "HC_URL_STORAGE"
 * @param {Record<string, string | undefined>} [opt.env]
 * @param {string} [opt.dosyaYolu]
 * @param {(yol: string) => string | null} [opt.oku]
 * @param {(yol: string) => number | null} [opt.izin] - 8'lik mod ya da null
 * @returns {{ url: string | null, notlar: string[] }}
 */
export function pingAdresiCoz({
  anahtar,
  env = process.env,
  dosyaYolu,
  oku = dosyaOku,
  izin = izinOku,
} = /** @type {any} */ ({})) {
  const notlar = [];
  const yol = dosyaYolu || env.HEALTHCHECKS_ENV || HC_VARSAYILAN_DOSYA;

  /** @type {string | null} */
  let ham = null;
  /** @type {string} */
  let kaynak = "";

  const ortamdan = (env[anahtar] || "").trim();
  if (ortamdan) {
    ham = ortamdan;
    kaynak = `ortam değişkeni ${anahtar}`;
  } else {
    const icerik = oku(yol);
    if (icerik === null) {
      notlar.push(
        `ping adresi yok (${yol} okunamadı) — dead-man's switch DEVRE DIŞI`
      );
      return { url: null, notlar };
    }

    const mod = izin(yol);
    if (mod !== null && (mod & 0o077) !== 0) {
      notlar.push(
        `UYARI: ${yol} izni ${mod.toString(8)} — 600 olmalı (ping adresi gizli sayılır)`
      );
    }

    ham = satirdanOku(icerik, anahtar);
    kaynak = `${yol} → ${anahtar}`;
    if (ham === null) {
      notlar.push(`ping adresi yok (${kaynak}) — dead-man's switch DEVRE DIŞI`);
      return { url: null, notlar };
    }
  }

  if (!ham.startsWith("https://")) {
    notlar.push(
      `UYARI: ping adresi https:// ile başlamıyor (${kaynak}) — YOK SAYILDI`
    );
    return { url: null, notlar };
  }

  return { url: ham.replace(/\/+$/, ""), notlar };
}

/**
 * `KEY=değer` satırını okur. Aynı anahtar birden çok kez geçerse SONUNCU
 * kazanır (dosyanın sonuna eklenen satır üsttekini eziyor sanılmasın).
 * Değer boşsa null döner.
 *
 * @param {string} icerik
 * @param {string} anahtar
 * @returns {string | null}
 */
export function satirdanOku(icerik, anahtar) {
  /** @type {string | null} */
  let sonuc = null;

  for (const satir of icerik.split("\n")) {
    const temiz = satir.replace(/\r$/, "").trim();
    if (!temiz || temiz.startsWith("#")) continue;

    const esit = temiz.indexOf("=");
    if (esit === -1) continue;
    if (temiz.slice(0, esit).trim() !== anahtar) continue;

    let deger = temiz.slice(esit + 1).trim();
    if (
      deger.length >= 2 &&
      ((deger.startsWith('"') && deger.endsWith('"')) ||
        (deger.startsWith("'") && deger.endsWith("'")))
    ) {
      deger = deger.slice(1, -1).trim();
    }
    sonuc = deger || null;
  }

  return sonuc;
}

/**
 * Ping atar. ASLA throw etmez, çağıranın çıkış kodunu etkilemez.
 *
 * @param {object} opt
 * @param {string | null} opt.url - null ise sessizce geçer
 * @param {"" | "/fail"} [opt.sonEk]
 * @param {string} [opt.govde] - Healthchecks panelinde/e-postasında görünür
 * @param {typeof fetch} [opt.fetchImpl]
 * @param {number} [opt.zamanAsimiMs]
 * @param {number} [opt.deneme]
 * @param {number} [opt.denemeArasiMs]
 * @param {(ms: number) => Promise<void>} [opt.beklet]
 * @returns {Promise<{ gonderildi: boolean, notlar: string[] }>}
 */
export async function pingAt({
  url,
  sonEk = "",
  govde = "",
  fetchImpl,
  zamanAsimiMs = HC_ZAMAN_ASIMI_MS,
  deneme = HC_DENEME,
  denemeArasiMs = HC_DENEME_ARASI_MS,
  beklet = (ms) => new Promise((r) => setTimeout(r, ms)),
} = /** @type {any} */ ({})) {
  const notlar = [];
  if (!url) return { gonderildi: false, notlar };

  const adres = `${url}${sonEk}`;
  const istek = fetchImpl || globalThis.fetch;
  let sonHata = "";

  for (let i = 1; i <= deneme; i++) {
    try {
      const res = await istek(adres, {
        method: "POST",
        body: govde.slice(0, 10_000),
        headers: { "content-type": "text/plain; charset=utf-8" },
        signal: AbortSignal.timeout(zamanAsimiMs),
      });
      if (res.ok) {
        notlar.push(`ping gönderildi${sonEk ? ` (${sonEk})` : ""}`);
        return { gonderildi: true, notlar };
      }
      sonHata = `HTTP ${res.status}`;
    } catch (err) {
      sonHata = err instanceof Error ? err.message : String(err);
    }
    if (i < deneme) await beklet(denemeArasiMs);
  }

  notlar.push(
    `UYARI: ping GÖNDERİLEMEDİ${sonEk ? ` (${sonEk})` : ""} (${deneme} deneme, ${sonHata}) — yedeğin sonucu bundan etkilenmez`
  );
  return { gonderildi: false, notlar };
}
