#!/usr/bin/env node
/**
 * rewrite-storage-urls.mjs — DB'deki tam storage adreslerini eski projeden
 * yeni projeye çevirir. (11 Eylül 2026 — NOTE.md "YEDEKTEN GERİ YÜKLEME")
 *
 * NEDEN: görseller DB'de https://<ref>.supabase.co/storage/v1/object/public/
 * images/... olarak durur. Yedek yeni projeye yüklenince bu adresler ESKİ
 * projeyi gösterir; host kontrolleri joker olduğu için hata vermez —
 * tatbikatta canlıdan yüklenip SAHTE BAŞARI, gerçek felakette kırık görsel.
 *
 * KULLANIM (yedeğin yüklendiği YENİ projeye karşı):
 *   node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski <eski-ref> --yeni <yeni-ref>        # RAPOR
 *   node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski <eski-ref> --yeni <yeni-ref> --yaz  # UYGULA
 *
 *   --env <dosya>   ZORUNLU. Bağlanılacak projenin URL + service role anahtarı.
 *                   .env / .env.local KENDİLİĞİNDEN OKUNMAZ; ortam yok sayılır.
 *   --eski <ref>    Adreslerde geçen eski proje ref'i (ör. canlı).
 *   --yeni <ref>    Yeni proje ref'i. Env'deki URL'in ref'i BUNUNLA AYNI
 *                   OLMALI: bir DB yalnız KENDİ storage'ını gösterecek şekilde
 *                   dönüştürülür — ayrı --hedef gereksiz, uyuşmazsa durulur.
 *   --yaz           Uygula. Yoksa yalnız RAPOR (kolon başına sayım).
 *
 * public şemadaki TÜM metin / jsonb / dizi kolonları taranır (tablolar
 * PostgREST OpenAPI'sinden — ileride eklenenler de). Yalnız
 * "https://<eski>.supabase.co/storage/v1/" öneki değişir; eski ref'in başka
 * biçimdeki geçişleri "dokunulmayan" diye raporlanır. --yaz sonrası tablo
 * yeniden taranır: eski önek kalmamalı.
 *
 * ÇIKIŞ: 0 = tamam; 1 = güncelleme hatası / yazdıktan sonra kalan adres /
 *   dokunulmayan geçiş; 2 = kullanım ya da hedef hatası.
 * Mantık: scripts/lib/storage-url-rewrite.mjs (test: test-rewrite-storage-urls.mjs).
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rewriteExitCode, runRewrite, totals } from "./lib/storage-url-rewrite.mjs";
import { TargetError, isValidRef, resolveTarget } from "./lib/target-env.mjs";

const USAGE =
  "Kullanım: node scripts/rewrite-storage-urls.mjs --env <dosya> --eski <ref> --yeni <ref> [--yaz]";

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ env: string | null, eski: string | null, yeni: string | null, yaz: boolean }} */
  const opts = { env: null, eski: null, yeni: null, yaz: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${arg} için değer gerekli.`);
      i++;
      return v;
    };
    if (arg === "--env") opts.env = value();
    else if (arg === "--eski") opts.eski = value();
    else if (arg === "--yeni") opts.yeni = value();
    else if (arg === "--yaz") opts.yaz = true;
    else throw new Error(`Bilinmeyen seçenek: ${arg}`);
  }
  if (!opts.env || !opts.eski || !opts.yeni) throw new Error("--env, --eski ve --yeni zorunlu.");
  if (!isValidRef(opts.eski)) throw new Error(`Geçersiz --eski ref: ${opts.eski}`);
  if (!isValidRef(opts.yeni)) throw new Error(`Geçersiz --yeni ref: ${opts.yeni}`);
  if (opts.eski === opts.yeni) throw new Error("--eski ile --yeni aynı olamaz.");
  return { env: opts.env, eski: opts.eski, yeni: opts.yeni, yaz: opts.yaz };
}

/** @param {import("./lib/storage-url-rewrite.mjs").RewriteReport} report */
function printReport(report) {
  const changed = report.columns.filter((c) => c.urls > 0 || c.leftover > 0);
  console.log(`Taranan tablo: ${report.tables}; adres bulunan kolon: ${changed.length}`);
  for (const c of changed) {
    console.log(
      `  ${`${c.table}.${c.column}`.padEnd(40)} satır ${String(c.rows).padStart(5)}   adres ${String(c.urls).padStart(6)}` +
        (c.leftover > 0 ? `   DOKUNULMAYAN ${c.leftover}` : "")
    );
  }
  for (const s of report.skipped) console.log(`  ATLANDI ${s.table}: ${s.reason} (elle bakılmalı)`);
  const t = totals(report);
  console.log(`Toplam: ${report.rowsChanged} satır, ${t.urls} adres; dokunulmayan eski ref geçişi: ${t.leftover}`);
  for (const f of report.failures) console.log(`  HATA ${f.table} id=${String(f.id)}: ${f.detail}`);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`HATA: ${/** @type {Error} */ (err).message}`);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const envPath = resolve(opts.env);
  let target;
  try {
    target = resolveTarget(await readFile(envPath, "utf8"), opts.yeni, envPath);
  } catch (err) {
    if (err instanceof TargetError || /** @type {{ code?: string }} */ (err).code === "ENOENT") {
      console.error(`HATA: ${err instanceof TargetError ? err.message : `env dosyası okunamadı: ${envPath}`}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const client = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** @type {import("./lib/storage-url-rewrite.mjs").RewriteDb} */
  const db = {
    async fetchSpec() {
      const res = await fetch(`${target.url}/rest/v1/`, {
        headers: { apikey: target.serviceKey, authorization: `Bearer ${target.serviceKey}` },
      });
      if (!res.ok) throw new Error(`OpenAPI tanımı alınamadı: HTTP ${res.status}`);
      return res.json();
    },
    async fetchPage(table, columns, pk, offset, limit) {
      const { data, error } = await client
        .from(table)
        .select(columns.join(","))
        .order(pk, { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`${table} okunamadı: ${error.message}`);
      return /** @type {Array<Record<string, unknown>>} */ (/** @type {unknown} */ (data ?? []));
    },
    async updateRow(table, pk, id, changes) {
      const { data, error } = await client.from(table).update(changes).eq(pk, id).select(pk);
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },
  };

  console.log(`Hedef : ${target.url} (ref ${target.ref})`);
  console.log(`Önek  : https://${opts.eski}.supabase.co/storage/v1/ → https://${opts.yeni}.supabase.co/storage/v1/`);
  console.log(`Mod   : ${opts.yaz ? "YAZ" : "RAPOR (hiçbir şey değişmez)"}`);
  console.log("");

  const report = await runRewrite(db, { eski: opts.eski, yeni: opts.yeni, write: opts.yaz });
  printReport(report);

  let after = null;
  if (opts.yaz) {
    after = await runRewrite(db, { eski: opts.eski, yeni: opts.yeni, write: false });
    console.log("");
    console.log(`Yeniden tarama: eski önekli adres ${totals(after).urls} (0 olmalı)`);
  } else if (report.rowsChanged > 0) {
    console.log("");
    console.log("Uygulamak için aynı komuta --yaz ekleyin.");
  }
  process.exitCode = rewriteExitCode(report, after);
}

main().catch((err) => {
  console.error("HATA:", err?.message ?? err);
  process.exitCode = 1;
});
