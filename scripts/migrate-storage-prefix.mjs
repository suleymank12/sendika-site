/**
 * Storage Prefix Migration — Sprint 2 / Madde 2.4 / Asama 2
 * ----------------------------------------------------------
 * Multi-tenant gecisi: bucket'taki prefix'siz eski dosyalari
 * {tenant_id}/... formatina goc eder.
 *
 *   - Dosyalari KOPYALAR (eski dosyalari SILMEZ)
 *   - DB'deki public URL'leri yeni path'e gunceller
 *   - Rollback icin manifest.json yazar
 *   - Idempotent: zaten prefix'li dosyalari atlar, tekrar calistirilabilir
 *   - Varsayilan olarak --dry-run ile guvenli on-izleme yapilir
 *
 * KULLANIM:
 *   node scripts/migrate-storage-prefix.mjs --dry-run   # on-izleme (hicbir sey degismez)
 *   node scripts/migrate-storage-prefix.mjs             # gercek goc
 *
 * NOT: Bu script Supabase'e service-role anahtariyla baglanir (RLS bypass).
 *      .env.local dosyasindan okur. Suleyman elle calistirir.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// .env.local yukleyici (bagimsiz — dotenv paketi gerektirmez)
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    console.error(`HATA: .env.local bulunamadi: ${envPath}`);
    process.exit(1);
  }
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Tirnak isaretlerini soy
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = "images";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error(
    "HATA: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY .env.local'de eksik"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// DB hedefleri — types/index.ts ve migration'lara gore dogrulanmis kolon listesi
// ---------------------------------------------------------------------------

// Tek bir public URL tutan kolonlar (esitlik ile eslesir)
// NOT: youtube_url kolonlari harici YouTube linkleridir, storage degil — DAHIL DEGIL.
const directUrlUpdates = [
  { table: "news", column: "cover_image" },
  { table: "news", column: "video_url" },
  { table: "announcements", column: "cover_image" },
  { table: "announcements", column: "video_url" },
  { table: "sliders", column: "image_url" },
  { table: "pages", column: "cover_image" },
  { table: "pages", column: "video_url" },
  { table: "gallery_albums", column: "cover_image" },
  { table: "gallery_images", column: "image_url" },
  { table: "board_members", column: "photo" },
  { table: "branches", column: "manager_photo" },
  { table: "headlines", column: "image_url" },
  { table: "headlines", column: "video_url" },
  { table: "homepage_section_items", column: "image_url" },
  { table: "content_media", column: "url" },
  { table: "tenants", column: "logo_url" },
  { table: "tenants", column: "favicon_url" },
];

// Rich-text HTML icine gomulu URL'ler (LIKE ile bulunur, JS'te replace edilir)
const htmlEmbeddedUpdates = [
  { table: "news", column: "content" },
  { table: "announcements", column: "content" },
  { table: "pages", column: "content" },
  { table: "headlines", column: "content" },
];

// site_settings (key-value) — URL tutan key'ler
const SETTINGS_KEYS = ["logo_url", "favicon_url", "site_logo_url"];

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

// Yeni format zaten prefix'li mi? (basta UUID/ klasoru)
function isAlreadyPrefixed(name) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(
    name
  );
}

function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Storage.list() rekursif degil — klasorlere manuel dal
async function listAllRecursive(prefix = "") {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit, offset });

    if (error) {
      console.error(`List hatasi (${prefix || "/"}):`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      // Supabase'te klasorlerin id'si null gelir
      if (item.id === null) {
        const subItems = await listAllRecursive(fullPath);
        results.push(...subItems);
      } else {
        results.push({ path: fullPath, size: item.metadata?.size });
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return results;
}

// Bir manifest entry'sinin DB guncellemesine konu olup olmadigi
function isMigrated(file) {
  return (
    file.status === "copied" ||
    file.status === "skipped" ||
    file.status === "dry-run"
  );
}

// ---------------------------------------------------------------------------
// Ana akis
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(70));
  console.log(
    `Storage Migration Script ${DRY_RUN ? "(DRY-RUN — degisiklik yok)" : "(GERCEK GOC)"}`
  );
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Default Tenant: ${DEFAULT_TENANT_ID}`);
  console.log("=".repeat(70));

  // 1) Tum dosyalari listele
  console.log("\n[1/4] Dosyalar listeleniyor...");
  const allFiles = await listAllRecursive();
  console.log(`  ${allFiles.length} dosya bulundu`);

  // 2) Prefix'li / prefix'siz ayir
  const toMigrate = allFiles.filter((f) => !isAlreadyPrefixed(f.path));
  const alreadyOk = allFiles.filter((f) => isAlreadyPrefixed(f.path));
  console.log(`  ${alreadyOk.length} dosya zaten prefix'li (atlanacak)`);
  console.log(`  ${toMigrate.length} dosya goc edilecek`);

  if (toMigrate.length === 0) {
    console.log("\nGoc edilecek dosya yok. Cikiliyor.");
    return;
  }

  // 3) Manifest iskeleti
  const manifest = {
    timestamp: new Date().toISOString(),
    dry_run: DRY_RUN,
    bucket: BUCKET,
    default_tenant_id: DEFAULT_TENANT_ID,
    total_files: toMigrate.length,
    files: [],
  };

  // --- Dosya kopyalama ---
  console.log("\n[2/4] Dosyalar kopyalaniyor...");
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of toMigrate) {
    const oldPath = file.path;
    const newPath = `${DEFAULT_TENANT_ID}/${oldPath}`;
    const entry = {
      oldPath,
      newPath,
      oldUrl: getPublicUrl(oldPath),
      newUrl: getPublicUrl(newPath),
      status: "pending",
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${oldPath} -> ${newPath}`);
      entry.status = "dry-run";
      manifest.files.push(entry);
      continue;
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .copy(oldPath, newPath);

    if (error) {
      // Idempotent: hedef zaten varsa atla
      if (
        /already exists|duplicate|resource already exists/i.test(
          error.message || ""
        )
      ) {
        console.log(`  [SKIP] ${newPath} zaten var`);
        entry.status = "skipped";
        skipped++;
      } else {
        console.error(`  [FAIL] ${oldPath}: ${error.message}`);
        entry.status = "failed";
        entry.error = error.message;
        failed++;
      }
    } else {
      console.log(`  [OK] ${oldPath} -> ${newPath}`);
      entry.status = "copied";
      copied++;
    }
    manifest.files.push(entry);
  }

  console.log(
    `\n  Kopyalandi: ${copied}, Atlandi: ${skipped}, Hata: ${failed}`
  );

  // --- DB: direct URL kolonlari ---
  console.log("\n[3/4] DB URL'leri guncelleniyor...");
  console.log("  [3.0] Tek-URL kolonlari...");
  for (const { table, column } of directUrlUpdates) {
    for (const file of manifest.files) {
      if (!isMigrated(file)) continue;

      if (DRY_RUN) {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq(column, file.oldUrl);
        if (error) {
          // Tablo/kolon yoksa sadece bilgilendir, durma
          if (!/does not exist|could not find/i.test(error.message)) {
            console.error(`  [DRY ERR] ${table}.${column}: ${error.message}`);
          }
          continue;
        }
        if (count && count > 0) {
          console.log(
            `  [DRY] ${table}.${column}: ${count} kayit  ${file.oldPath} -> ${file.newPath}`
          );
        }
        continue;
      }

      const { error } = await supabase
        .from(table)
        .update({ [column]: file.newUrl })
        .eq(column, file.oldUrl);

      if (error && !/does not exist|could not find/i.test(error.message)) {
        console.error(`  [FAIL UPDATE] ${table}.${column}: ${error.message}`);
      }
    }
  }

  // --- DB: HTML icine gomulu URL'ler ---
  console.log("  [3.1] HTML icerik kolonlari (fetch + replace)...");
  for (const { table, column } of htmlEmbeddedUpdates) {
    for (const file of manifest.files) {
      if (!isMigrated(file)) continue;

      if (DRY_RUN) {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .like(column, `%${file.oldUrl}%`);
        if (error) {
          if (!/does not exist|could not find/i.test(error.message)) {
            console.error(`  [DRY ERR] ${table}.${column}: ${error.message}`);
          }
          continue;
        }
        if (count && count > 0) {
          console.log(
            `  [DRY HTML] ${table}.${column}: ${count} kayit icinde ${file.oldPath}`
          );
        }
        continue;
      }

      const { data: rows, error: fetchErr } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .like(column, `%${file.oldUrl}%`);

      if (fetchErr) {
        if (!/does not exist|could not find/i.test(fetchErr.message)) {
          console.error(`  [FAIL FETCH] ${table}.${column}: ${fetchErr.message}`);
        }
        continue;
      }
      if (!rows) continue;

      for (const row of rows) {
        const current = row[column];
        if (!current) continue;
        const updated = current.replaceAll(file.oldUrl, file.newUrl);
        if (updated !== current) {
          const { error: updErr } = await supabase
            .from(table)
            .update({ [column]: updated })
            .eq("id", row.id);
          if (updErr) {
            console.error(
              `  [FAIL UPDATE HTML] ${table}.${column} id=${row.id}: ${updErr.message}`
            );
          }
        }
      }
    }
  }

  // --- DB: site_settings (key-value) ---
  console.log("  [3.2] site_settings (key-value)...");
  for (const key of SETTINGS_KEYS) {
    for (const file of manifest.files) {
      if (!isMigrated(file)) continue;

      if (DRY_RUN) {
        const { count, error } = await supabase
          .from("site_settings")
          .select("*", { count: "exact", head: true })
          .eq("key", key)
          .eq("value", file.oldUrl);
        if (error) {
          if (!/does not exist|could not find/i.test(error.message)) {
            console.error(`  [DRY ERR] site_settings[${key}]: ${error.message}`);
          }
          continue;
        }
        if (count && count > 0) {
          console.log(`  [DRY] site_settings[${key}]: ${count} kayit`);
        }
        continue;
      }

      const { error } = await supabase
        .from("site_settings")
        .update({ value: file.newUrl })
        .eq("key", key)
        .eq("value", file.oldUrl);
      if (error && !/does not exist|could not find/i.test(error.message)) {
        console.error(`  [FAIL UPDATE] site_settings[${key}]: ${error.message}`);
      }
    }
  }

  // --- Manifest yaz ---
  console.log("\n[4/4] Manifest yaziliyor...");
  const stamp = manifest.timestamp.replace(/[:.]/g, "-");
  const manifestPath = join(
    __dirname,
    `manifest-${DRY_RUN ? "dryrun" : "live"}-${stamp}.json`
  );
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest: ${manifestPath}`);

  console.log("\n" + "=".repeat(70));
  if (DRY_RUN) {
    console.log(
      "DRY-RUN tamamlandi. Gercek calistirma icin --dry-run flag'siz tekrar calistir:"
    );
    console.log("  node scripts/migrate-storage-prefix.mjs");
  } else {
    console.log("Migration tamamlandi.");
    console.log(
      "ESKI DOSYALAR SILINMEDI. Dogrulamadan sonra elle (veya ayri cleanup ile) silinebilir."
    );
  }
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
