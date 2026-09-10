#!/usr/bin/env node
/**
 * sweep-orphan-storage.mjs — silinmiş kurumlara ait YETİM storage klasörlerini
 * bulur ve (açık onayla) siler.
 *
 * NEDEN: delete-tenant storage'ı kurum silindikten sonra en iyi çabayla ve
 * 20 sn süre bütçesiyle temizler. Sığmayan dosyalar ya da bu özellikten ÖNCE
 * silinmiş kurumların dosyaları bucket'ta kalır; bu script onları bulur.
 *
 * KULLANIM (tam checkout'ta — lokal / WSL; .env.local ya da .env canlı
 * projeye bağlı, SUPABASE_SERVICE_ROLE_KEY gerekli):
 *   node scripts/sweep-orphan-storage.mjs                        # RAPOR (varsayılan) — hiçbir şey silmez
 *   npm run sweep:storage                                         # = rapor
 *   node scripts/sweep-orphan-storage.mjs --sil <uuid>[,<uuid>]   # yalnız ADI VERİLEN yetim klasörleri siler
 *
 * AÇIK ONAY: silinecek klasörlerin UUID'leri rapordan kopyalanıp --sil ile
 * verilir. "Hepsini sil" seçeneği BİLEREK yok — silinecek küme gözle görülmüş
 * olmalı. Verilen her UUID bu koşumda YENİDEN doğrulanır (hâlâ yetim mi);
 * değilse reddedilir.
 *
 * GUARD'LAR: src/lib/super-admin/tenant-storage-purge.mjs ile AYNI kod
 * (delete-tenant route'u da onu kullanır): geçerli UUID, varsayılan kurum
 * reddi, kurum tenants'ta VARSA dokunmama (silmeden hemen önce yeniden
 * sorulur), segment kontrolü, yalnız Storage API .remove(). Kökteki
 * tanınmayan öğeler (UUID olmayan klasörler, kök dosyaları) raporlanır,
 * ASLA silinmez.
 *
 * NOT: VPS'teki /var/www/sendika-site yalnız standalone çıktıyı tutar (src/
 * yok) — script tam checkout'ta çalıştırılır. Node 20+ yeter (.mjs).
 * Çıkış kodu: 0 = temiz / rapor tamam, 1 = silme eksik ya da reddedilen hedef,
 * 2 = kullanım hatası.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STORAGE_BUCKET,
  fetchAllTenantIds,
  findOrphanTenantFolders,
  listRootEntries,
  listTenantFiles,
  purgeTenantStorage,
  resolveSweepTargets,
} from "../src/lib/super-admin/tenant-storage-purge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Ortam değişkeni yükleyici (backup-storage.mjs ile aynı: .env.local, yoksa .env)
// ---------------------------------------------------------------------------
function loadEnv() {
  const adaylar = [join(__dirname, "..", ".env.local"), join(__dirname, "..", ".env")];
  const bulunan = adaylar.find((p) => existsSync(p));
  if (!bulunan) {
    console.error("HATA: ortam dosyası bulunamadı. Denenen yollar:");
    adaylar.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  for (const line of readFileSync(bulunan, "utf8").split(/\r?\n/)) {
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

/** @param {string[]} argv */
function parseArgs(argv) {
  const i = argv.findIndex((a) => a === "--sil" || a.startsWith("--sil="));
  if (i === -1) return { mode: "rapor", targets: [] };
  const raw = argv[i].startsWith("--sil=") ? argv[i].slice("--sil=".length) : argv[i + 1];
  if (!raw || raw.startsWith("--")) {
    console.error("HATA: --sil için en az bir klasör UUID'si verin (rapordan kopyalayın).");
    process.exit(2);
  }
  return {
    mode: "sil",
    targets: raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** @param {number} bytes */
function boyut(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}

async function main() {
  const { mode, targets } = parseArgs(process.argv.slice(2));
  const envDosyasi = loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("HATA: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.");
    process.exit(1);
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Ortam  : ${envDosyasi} → ${new URL(url).host}`);
  console.log(`Bucket : ${STORAGE_BUCKET}`);
  console.log(
    `Mod    : ${mode === "rapor" ? "RAPOR (hiçbir şey silinmez)" : `SİL — yalnız: ${targets.join(", ")}`}`
  );
  console.log("");

  const [root, tenantIds] = await Promise.all([listRootEntries(admin), fetchAllTenantIds(admin)]);
  const { orphans, unknown } = findOrphanTenantFolders(root, tenantIds);

  console.log(`Kök kayıt: ${root.length}   kayıtlı kurum: ${tenantIds.length}`);
  if (unknown.length > 0) {
    console.log(`Tanınmayan kök öğeler (DOKUNULMAZ): ${unknown.join(", ")}`);
  }

  if (orphans.length === 0) {
    console.log("Yetim klasör YOK.");
  } else {
    console.log(`Yetim klasör: ${orphans.length}`);
    for (const id of orphans) {
      const liste = await listTenantFiles(admin, id);
      const toplam = liste.files.reduce((s, f) => s + (f.size ?? 0), 0);
      const eksik = liste.complete ? "" : `   (listeleme EKSİK: ${liste.error ?? "?"})`;
      console.log(`  ${id}   ${liste.files.length} dosya   ${boyut(toplam)}${eksik}`);
      for (const f of liste.files.slice(0, 3)) console.log(`      ${f.path}`);
      if (liste.files.length > 3) console.log(`      … ve ${liste.files.length - 3} dosya daha`);
    }
  }

  if (mode === "rapor") {
    if (orphans.length > 0) {
      console.log("");
      console.log("Silmek için (UUID'leri kontrol ederek):");
      console.log(`  node scripts/sweep-orphan-storage.mjs --sil ${orphans.join(",")}`);
    }
    return;
  }

  console.log("");
  const { accepted, rejected } = resolveSweepTargets(targets, orphans);
  let eksikVar = rejected.length > 0;
  for (const r of rejected) console.log(`  REDDEDİLDİ ${r.id}: ${r.reason}`);

  for (const id of accepted) {
    // Süre bütçesi yok (nginx arkasında değil); guard'lar route ile aynı.
    const sonuc = await purgeTenantStorage(admin, id);
    const kalan = sonuc.remaining + sonuc.skippedForeign;
    console.log(
      `  ${id}: ${sonuc.status} — silinen ${sonuc.removed}/${sonuc.listed}, kalan ${kalan}` +
        (sonuc.reason ? ` (${sonuc.reason})` : "") +
        (sonuc.error ? ` — hata: ${sonuc.error}` : "")
    );
    if (sonuc.status !== "done") eksikVar = true;
  }

  process.exitCode = eksikVar ? 1 : 0;
}

main().catch((err) => {
  console.error("HATA:", err?.message ?? err);
  process.exitCode = 1;
});
