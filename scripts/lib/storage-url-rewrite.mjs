// @ts-check
/**
 * Storage URL dönüşümü — SAF mantık (scripts/rewrite-storage-urls.mjs kullanır).
 * (11 Eylül 2026 — NOTE.md "YEDEKTEN GERİ YÜKLEME")
 *
 * NEDEN: Uygulama görselleri DB'ye getPublicUrl() çıktısı olarak — TAM adresle
 * — yazar: https://<ref>.supabase.co/storage/v1/object/public/images/...
 * (cover_image, image_url, photo, logo_url, zengin metin HTML'indeki <img
 * src>, site_settings.value...). Yedek yeni bir projeye yüklenince host
 * değişir; adresler ESKİ projeyi göstermeye devam eder. Host kontrolleri
 * joker (*.supabase.co: next/image, CSP, sanitize) olduğu için bu SESSİZDİR:
 * tatbikatta görseller canlıdan yüklenip SAHTE BAŞARI verir, gerçek
 * felakette (eski proje yok) hepsi kırılır.
 *
 * NE DEĞİŞİR: yalnız "https://<eski>.supabase.co/storage/v1/" öneki →
 * "https://<yeni>.supabase.co/storage/v1/" (object/public, render/image,
 * sign — hepsi). Eski ref'in BAŞKA biçimde geçtiği yerler DEĞİŞTİRİLMEZ,
 * "dokunulmayan" diye sayılıp raporlanır (elle bakılmalı).
 *
 * NASIL: tablolar ve metin kolonları PostgREST'in OpenAPI tanımından
 * bulunur (public şemadaki TÜM tablolar — ileride eklenenler de). Değerler
 * JS'te taranır: metin (HTML dahil) doğrudan, jsonb / dizi derinlemesine;
 * tip korunur. Yalnız değişen kolonlar, birincil anahtarla güncellenir.
 * Sayfalama YALNIZ boş sayfada durur. DB erişimi dışarıdan verilir (test).
 *
 * Import'suz — test script'i doğrudan alır.
 */

export const STORAGE_PATH = "/storage/v1/";
export const PAGE_SIZE = 500;
export const MAX_PAGES = 100_000;

/** @param {string} ref */
export function storagePrefix(ref) {
  return `https://${ref}.supabase.co${STORAGE_PATH}`;
}

/**
 * Değerdeki `from` öneklerini `to` ile değiştirir. Metin doğrudan; dizi ve
 * nesne (jsonb) derinlemesine. Değişiklik yoksa AYNI değer döner.
 * @param {unknown} value
 * @param {string} from
 * @param {string} to
 * @returns {{ value: unknown, count: number }}
 */
export function rewriteValue(value, from, to) {
  if (typeof value === "string") {
    if (!value.includes(from)) return { value, count: 0 };
    const parts = value.split(from);
    return { value: parts.join(to), count: parts.length - 1 };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const out = value.map((v) => {
      const r = rewriteValue(v, from, to);
      count += r.count;
      return r.value;
    });
    return count > 0 ? { value: out, count } : { value, count: 0 };
  }
  if (value !== null && typeof value === "object") {
    let count = 0;
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteValue(v, from, to);
      count += r.count;
      out[k] = r.value;
    }
    return count > 0 ? { value: out, count } : { value, count: 0 };
  }
  return { value, count: 0 };
}

/**
 * Değerde `ref` kaç kez geçiyor (büyük/küçük harf duyarsız; jsonb için
 * serileştirilmiş hali). Dönüşümden SONRA çağrılır → "dokunulmayan" geçişler.
 * @param {unknown} value
 * @param {string} ref
 */
export function countMentions(value, ref) {
  if (value === null || value === undefined) return 0;
  const text = (typeof value === "string" ? value : JSON.stringify(value)).toLowerCase();
  const needle = ref.toLowerCase();
  let count = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) count++;
  return count;
}

const TEXTISH_FORMAT = /^(text|character varying|character|citext|json|jsonb)$|\[\]$/;

/**
 * OpenAPI (PostgREST, swagger 2.0) → dönüştürülecek tablolar.
 * Birincil anahtar: açıklamasında "<pk/>" olan kolon (PostgREST işareti).
 * Tek kolonlu PK'si olmayan (görünüm, bileşik PK) tablolar ATLANIR ve
 * raporlanır — güvenle satır satır güncellenemez.
 * @param {any} spec
 * @returns {{ tables: Array<{ table: string, pk: string, columns: string[] }>, skipped: Array<{ table: string, reason: string }> }}
 */
export function textColumnsFromOpenApi(spec) {
  /** @type {Array<{ table: string, pk: string, columns: string[] }>} */
  const tables = [];
  /** @type {Array<{ table: string, reason: string }>} */
  const skipped = [];
  const definitions = spec && typeof spec === "object" ? spec.definitions ?? {} : {};
  for (const [table, def] of Object.entries(definitions)) {
    const props = Object.entries(/** @type {any} */ (def)?.properties ?? {});
    const pk = props
      .filter(([, p]) => String(p?.description ?? "").includes("<pk/>"))
      .map(([c]) => c);
    const columns = props
      .filter(([c, p]) => TEXTISH_FORMAT.test(String(p?.format ?? "")) && !pk.includes(c))
      .map(([c]) => c);
    if (columns.length === 0) continue;
    if (pk.length !== 1) {
      skipped.push({ table, reason: pk.length === 0 ? "birincil anahtar yok" : "bileşik birincil anahtar" });
      continue;
    }
    tables.push({ table, pk: pk[0], columns });
  }
  tables.sort((a, b) => (a.table < b.table ? -1 : 1));
  return { tables, skipped };
}

/**
 * @typedef {{
 *   fetchSpec(): Promise<any>,
 *   fetchPage(table: string, columns: string[], pk: string, offset: number, limit: number): Promise<Array<Record<string, unknown>>>,
 *   updateRow(table: string, pk: string, id: unknown, changes: Record<string, unknown>): Promise<number>,
 * }} RewriteDb
 *
 * @typedef {{ table: string, column: string, rows: number, urls: number, leftover: number }} ColumnStat
 *
 * @typedef {{
 *   from: string, to: string, write: boolean,
 *   tables: number, skipped: Array<{ table: string, reason: string }>,
 *   columns: ColumnStat[], rowsChanged: number,
 *   failures: Array<{ table: string, id: unknown, detail: string }>,
 * }} RewriteReport
 */

/**
 * Tüm public tabloları tarar; write=true ise değişen satırları günceller.
 * @param {RewriteDb} db
 * @param {{ eski: string, yeni: string, write: boolean, pageSize?: number }} opts
 * @returns {Promise<RewriteReport>}
 */
export async function runRewrite(db, { eski, yeni, write, pageSize = PAGE_SIZE }) {
  const from = storagePrefix(eski);
  const to = storagePrefix(yeni);
  const { tables, skipped } = textColumnsFromOpenApi(await db.fetchSpec());
  /** @type {RewriteReport} */
  const report = { from, to, write, tables: tables.length, skipped, columns: [], rowsChanged: 0, failures: [] };

  for (const t of tables) {
    /** @type {Map<string, ColumnStat>} */
    const stats = new Map(
      t.columns.map((c) => [c, { table: t.table, column: c, rows: 0, urls: 0, leftover: 0 }])
    );
    let offset = 0;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) throw new Error(`Sayfalama sınırı aşıldı: ${t.table}`);
      const rows = await db.fetchPage(t.table, [t.pk, ...t.columns], t.pk, offset, pageSize);
      if (!rows || rows.length === 0) break; // YALNIZ boş sayfada dur
      for (const row of rows) {
        /** @type {Record<string, unknown>} */
        const changes = {};
        for (const column of t.columns) {
          const r = rewriteValue(row[column], from, to);
          const stat = /** @type {ColumnStat} */ (stats.get(column));
          if (r.count > 0) {
            stat.rows++;
            stat.urls += r.count;
            changes[column] = r.value;
          }
          stat.leftover += countMentions(r.value, eski);
        }
        if (Object.keys(changes).length === 0) continue;
        report.rowsChanged++;
        if (!write) continue;
        try {
          const updated = await db.updateRow(t.table, t.pk, row[t.pk], changes);
          if (updated !== 1) {
            report.failures.push({ table: t.table, id: row[t.pk], detail: `${updated} satır güncellendi (1 bekleniyordu)` });
          }
        } catch (err) {
          report.failures.push({
            table: t.table,
            id: row[t.pk],
            detail: /** @type {{ message?: string }} */ (err)?.message ?? String(err),
          });
        }
      }
      offset += rows.length;
    }
    report.columns.push(...stats.values());
  }
  return report;
}

/** @param {RewriteReport} report */
export function totals(report) {
  return report.columns.reduce(
    (acc, c) => ({ urls: acc.urls + c.urls, leftover: acc.leftover + c.leftover }),
    { urls: 0, leftover: 0 }
  );
}

/**
 * Çıkış kodu. 1: güncelleme hatası, yazdıktan sonra eski önek kaldı, ya da
 * eski ref başka biçimde geçiyor (elle bakılmalı). RAPOR modunda dönüştürülecek
 * adres bulunması hata DEĞİLDİR.
 * @param {RewriteReport} report
 * @param {RewriteReport | null} after  --yaz sonrası yeniden tarama
 */
export function rewriteExitCode(report, after) {
  if (report.failures.length > 0) return 1;
  if (totals(report).leftover > 0) return 1;
  if (report.write && after && totals(after).urls > 0) return 1;
  return 0;
}
