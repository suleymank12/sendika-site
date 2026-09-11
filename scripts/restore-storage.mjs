#!/usr/bin/env node
/**
 * restore-storage.mjs — storage yedeğini (yerel ayna) bir projenin `images`
 * bucket'ına geri yükler. (11 Eylül 2026 — NOTE.md "YEDEKTEN GERİ YÜKLEME")
 *
 * KULLANIM (VPS'te — ayna orada; tam checkout /opt/build/sendika-site):
 *   node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <ref>            # RAPOR
 *   node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <ref> --yukle    # YÜKLE
 *
 * SEÇENEKLER:
 *   --env <dosya>              ZORUNLU. Hedef projenin NEXT_PUBLIC_SUPABASE_URL +
 *                              SUPABASE_SERVICE_ROLE_KEY'i. .env / .env.local
 *                              KENDİLİĞİNDEN OKUNMAZ (VPS'teki .env CANLIYI gösterir);
 *                              ortam değişkenleri de yok sayılır.
 *   --hedef <project-ref>      ZORUNLU. Env'deki URL'in ref'i bununla aynı değilse
 *                              hiçbir şey yapılmadan durulur (çıkış 2).
 *   --kaynak <dizin>           Ayna (varsayılan /var/backups/storage).
 *   --yukle                    Gerçekten yükle. Yoksa yalnız RAPOR.
 *   --onek <tenant-uuid>       Yalnız o kurumun klasörü.
 *   --silinenler-dahil <tarih> _silinenler/{tarih ve sonrası}/ dosyalarını da
 *                              orijinal yollarına döndür (aynadaki kazanır).
 *
 * DAVRANIŞ: aynı yol + aynı boyut → atla; boyut farklı → ÇAKIŞMA (üzerine
 *   YAZILMAZ); eksik → yükle (stream, x-upsert:false, içerik tipi uzantıdan,
 *   cache 3600, 4 paralel, 3 deneme). Bucket OLUŞTURULMAZ — yoksa KURULUM.md
 *   Adım 4. Sonda hedef yeniden listelenir, sayı + boyut aynayla karşılaştırılır.
 *
 * ÇIKIŞ: 0 = tamam; 1 = hata / çakışma / boyut sınırı / doğrulama farkı;
 *   2 = kullanım ya da hedef hatası. Mantık: scripts/lib/storage-restore.mjs
 *   (test: scripts/test-restore-storage.mjs).
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { resolve } from "node:path";
import {
  BUCKET,
  CACHE_CONTROL_SECONDS,
  UsageError,
  encodeStoragePath,
  formatBytes,
  listRemoteFiles,
  mimeFromPath,
  parseArgs,
  restoreExitCode,
  runRestore,
  selectSources,
  walkMirror,
} from "./lib/storage-restore.mjs";
import { TargetError, resolveTarget } from "./lib/target-env.mjs";

/** Yükleme başına üst süre — 400 MB video yavaş hatta da sığsın. */
const UPLOAD_TIMEOUT_MS = 15 * 60_000;

/** @type {import("./lib/storage-restore.mjs").MirrorFs} */
const nodeFs = {
  async readdir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
  },
  async size(file) {
    return (await stat(file)).size;
  },
};

/**
 * Tek dosyayı Storage REST API'sine STREAM ederek yükler (dosya belleğe
 * alınmaz). Content-Length verilir: parçalı aktarım (chunked) kullanılmaz.
 * @param {{ url: string, serviceKey: string }} target
 * @returns {import("./lib/storage-restore.mjs").Uploader}
 */
function makeUploader(target) {
  return (item) =>
    new Promise((resolvePromise, reject) => {
      const endpoint = new URL(`/storage/v1/object/${BUCKET}/${encodeStoragePath(item.path)}`, target.url);
      const transport = endpoint.protocol === "http:" ? http : https;
      const req = transport.request(
        endpoint,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${target.serviceKey}`,
            apikey: target.serviceKey,
            "content-type": mimeFromPath(item.path),
            "content-length": String(item.size),
            "cache-control": `max-age=${CACHE_CONTROL_SECONDS}`,
            "x-upsert": "false",
          },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            if (body.length < 4096) body += chunk;
          });
          res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, bodyText: body }));
          res.on("error", reject);
        }
      );
      req.setTimeout(UPLOAD_TIMEOUT_MS, () =>
        req.destroy(Object.assign(new Error("yükleme zaman aşımı"), { code: "TIMEOUT" }))
      );
      req.on("error", reject);
      const stream = createReadStream(item.localPath);
      stream.on("error", (err) => req.destroy(err));
      stream.pipe(req);
    });
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`HATA: ${err.message}`);
      console.error("Kullanım: node scripts/restore-storage.mjs --env <dosya> --hedef <project-ref> [--yukle] [--kaynak <dizin>] [--onek <uuid>] [--silinenler-dahil <YYYY-AA-GG>]");
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const envPath = resolve(opts.env);
  let target;
  try {
    target = resolveTarget(await readFile(envPath, "utf8"), opts.hedef, envPath);
  } catch (err) {
    if (err instanceof TargetError || /** @type {{ code?: string }} */ (err).code === "ENOENT") {
      console.error(`HATA: ${err instanceof TargetError ? err.message : `env dosyası okunamadı: ${envPath}`}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const kaynak = resolve(opts.kaynak);
  console.log(`Hedef  : ${target.url} (ref ${target.ref}) — bucket ${BUCKET}`);
  console.log(`Kaynak : ${kaynak}`);
  console.log(`Mod    : ${opts.yukle ? "YÜKLE" : "RAPOR (hiçbir şey yüklenmez)"}`);
  console.log(`Kapsam : ${opts.onek ?? "tüm kurumlar"}`);
  console.log(`Silinenler: ${opts.silinenlerDahil ? `${opts.silinenlerDahil} ve sonrası dahil` : "hariç"}`);
  console.log("");

  const admin = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Bucket OLUŞTURULMAZ — ayarları (public, boyut sınırı) tek yerde kalsın.
  const { error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (bucketError) {
    console.error(`HATA: hedefte "${BUCKET}" bucket'ı yok ya da okunamadı (${bucketError.message}).`);
    console.error("KURULUM.md Adım 4'e göre oluşturun (ya da yedekteki storage.buckets satırını yükleyin). Script bucket OLUŞTURMAZ.");
    process.exitCode = 1;
    return;
  }

  /** @type {import("./lib/storage-restore.mjs").ListPage} */
  const listPage = async (prefix, offset, limit) => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listeleme hatası (${prefix || "/"}): ${error.message}`);
    return data ?? [];
  };
  const relist = () => listRemoteFiles(listPage, opts.onek ?? "");

  const scan = await walkMirror(nodeFs, kaynak);
  const sources = selectSources(scan, { onek: opts.onek, silinenlerDahil: opts.silinenlerDahil });
  const remoteBefore = await relist();
  const toplam = sources.reduce((s, f) => s + f.size, 0);
  console.log(`Ayna   : ${scan.live.length} dosya; _silinenler: ${scan.deleted.length} dosya; hariç tutulan: ${scan.excluded.length}`);
  console.log(`Kaynak kümesi: ${sources.length} dosya (${formatBytes(toplam)}); hedefte şu an: ${remoteBefore.size} dosya`);

  let done = 0;
  const report = await runRestore({
    sources,
    remoteBefore,
    write: opts.yukle,
    upload: makeUploader(target),
    relist,
    onResult: (item, outcome) => {
      done++;
      if (outcome.kind !== "ok") console.log(`  [${done}] ${outcome.kind.toUpperCase()} ${item.path} — ${outcome.detail}`);
      else if (done % 25 === 0) console.log(`  … ${done} dosya işlendi`);
    },
  });

  const { plan } = report;
  const yuklenecek = plan.upload.reduce((s, f) => s + f.size, 0);
  console.log("");
  console.log(
    `Plan   : yüklenecek ${plan.upload.length} (${formatBytes(yuklenecek)}) · atlanacak ${plan.skip.length} (hedefte aynı boyutta) · ÇAKIŞMA ${plan.conflict.length}`
  );
  for (const c of plan.conflict) {
    console.log(`  ÇAKIŞMA ${c.path}: ayna ${c.size} B, hedef ${c.remoteSize ?? "bilinmiyor"} B — üzerine YAZILMADI`);
  }
  const fromDeleted = sources.filter((s) => s.source !== "ayna").length;
  if (fromDeleted > 0) console.log(`  (${fromDeleted} dosya _silinenler'den)`);

  if (report.write) {
    console.log(
      `Yükleme: yüklendi ${report.uploaded.length} · zaten vardı ${report.exists.length} · boyut sınırı ${report.tooLarge.length} · hata ${report.errors.length}`
    );
    for (const f of report.tooLarge) console.log(`  BOYUT SINIRI ${f.path} (${formatBytes(f.size)}) — ${f.detail}`);
    for (const f of report.errors) console.log(`  HATA ${f.path} — ${f.detail}`);
    const v = report.verify;
    if (v) {
      console.log(
        `Son doğrulama: hedefte eksik ${v.missing.length} · boyut farkı ${v.sizeMismatch.length} · hedefte fazladan ${v.extra.length} (aynada yok — dokunulmadı)`
      );
      for (const p of v.missing.slice(0, 20)) console.log(`  EKSİK ${p}`);
      for (const m of v.sizeMismatch.slice(0, 20)) console.log(`  BOYUT FARKI ${m.path}: ayna ${m.local} B, hedef ${m.remote ?? "?"} B`);
    }
  } else if (plan.upload.length > 0) {
    console.log("");
    console.log(`Yüklemek için aynı komuta --yukle ekleyin.`);
  }

  process.exitCode = restoreExitCode(report);
}

main().catch((err) => {
  console.error("HATA:", err?.message ?? err);
  process.exitCode = 1;
});
