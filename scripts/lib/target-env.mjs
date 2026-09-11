// @ts-check
/**
 * Hedef proje güvenliği — geri yükleme ve URL dönüşüm script'leri için ortak.
 * (11 Eylül 2026 — NOTE.md "YEDEKTEN GERİ YÜKLEME")
 *
 * NEDEN: VPS'teki /opt/build/sendika-site/.env (ve lokal .env.local) CANLI
 * projeyi gösterir. Bu araçlar o dosyaları KENDİLİĞİNDEN OKUMAZ: hedefin env
 * dosyası --env ile açıkça verilir ve beklenen proje ref'i ayrıca yazılır.
 * İkisi uyuşmazsa hiçbir şey yapılmadan durulur. process.env de bilerek YOK
 * SAYILIR — kabukta kalmış canlı değişkenler hedefi sessizce değiştirmesin.
 *
 * Import'suz — test script'leri doğrudan alır.
 */

/** Supabase proje ref'i: 20 küçük harf / rakam (ör. jqwmnawzehyvpwrtdvku). */
export const REF_RE = /^[a-z0-9]{20}$/;

/** @param {unknown} ref */
export function isValidRef(ref) {
  return typeof ref === "string" && REF_RE.test(ref);
}

/**
 * .env metnini ayrıştırır (diğer script'lerle aynı kurallar: yorum ve boş
 * satır atlanır, çift/tek tırnak soyulur, "export " öneki kabul edilir).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * https://<ref>.supabase.co → ref. Başka biçim (özel alan adı, http, yerel
 * Supabase) → null: ref doğrulanamayan hedefe yazılmaz.
 * @param {string} url
 */
export function refFromSupabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  return match ? match[1] : null;
}

export class TargetError extends Error {}

/**
 * Env dosyasının içeriğinden hedefi çözer ve BEKLENEN ref ile karşılaştırır.
 * @param {string} envText   --env ile verilen dosyanın içeriği
 * @param {string} expectedRef  --hedef (ya da --yeni) ile verilen ref
 * @param {string} envLabel  hata mesajında gösterilecek dosya adı
 * @returns {{ url: string, serviceKey: string, ref: string }}
 */
export function resolveTarget(envText, expectedRef, envLabel) {
  if (!isValidRef(expectedRef)) {
    throw new TargetError(`Geçersiz proje ref'i: "${expectedRef}" (20 küçük harf/rakam olmalı).`);
  }
  const env = parseEnvText(envText);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new TargetError(`${envLabel}: NEXT_PUBLIC_SUPABASE_URL yok.`);
  if (!serviceKey) throw new TargetError(`${envLabel}: SUPABASE_SERVICE_ROLE_KEY yok.`);
  const ref = refFromSupabaseUrl(url);
  if (!ref) {
    throw new TargetError(
      `${envLabel}: NEXT_PUBLIC_SUPABASE_URL bir Supabase proje adresi değil (https://<ref>.supabase.co): ${url}`
    );
  }
  if (ref !== expectedRef) {
    throw new TargetError(
      `HEDEF UYUŞMUYOR: ${envLabel} → ${ref}, beklenen → ${expectedRef}. Hiçbir şey yapılmadı.`
    );
  }
  return { url: url.replace(/\/+$/, ""), serviceKey, ref };
}
