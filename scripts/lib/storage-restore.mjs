// @ts-check
/**
 * Storage geri yükleme — SAF mantık (scripts/restore-storage.mjs kullanır).
 * (11 Eylül 2026 — NOTE.md "YEDEKTEN GERİ YÜKLEME")
 *
 * Kaynak: backup-storage.mjs'in yerel aynası ({tenant_id}/{klasör}/{dosya},
 * silinenler _silinenler/{YYYY-AA-GG}/ altında). Hedef: bir projenin
 * `images` bucket'ı. Dosya sistemi, listeleme ve yükleme DIŞARIDAN verilir —
 * test sahte bağımlılıklarla koşar.
 *
 * KURALLAR (onaylı tasarım):
 *  - Aynı yol + aynı boyut → ATLA. Boyut farklı → ÇAKIŞMA, üzerine YAZILMAZ
 *    (yükleme hep x-upsert: false). Yeniden koşulabilir; yarıda kalırsa
 *    kaldığı yerden devam eder; canlıya kısmi dönüşte bile dosya ezmez.
 *  - Kapsam canlı ayna. _silinenler/, yedek.log, *.part, nokta dosyaları
 *    hariç. --silinenler-dahil <tarih>: o tarih ve sonrasında silinenler
 *    orijinal yollarına döner (aynı yol birden çok tarihte → en yeni; aynada
 *    da varsa ayna kazanır). Gerekçe: ayna "bugün"dür; N gün önceki DB
 *    dökümü o günden sonra silinen dosyaları hâlâ gösterir.
 *  - Listeleme YALNIZ boş sayfada durur ("az geldi → bitti" varsayılmaz —
 *    sunucu tarafı limit sessizce dosya atlatır; backup-storage.mjs tuzağı).
 *  - 5xx / 429 / ağ hatası → 3 deneme. 409 (zaten var) → atlandı, denenmez.
 *    Boyut sınırı ayrı sayılır (Free planda dosya başına 50 MB).
 *
 * Import'suz — test script'i doğrudan alır.
 */

export const BUCKET = "images";
export const SILINENLER_DIZIN = "_silinenler";
export const LIST_PAGE_SIZE = 100;
export const LIST_MAX_PAGES = 10_000;
export const UPLOAD_CONCURRENCY = 4;
export const UPLOAD_TRIES = 3;
/** Uygulamanın yüklemelerindeki varsayılan (supabase-js cacheControl "3600"). */
export const CACHE_CONTROL_SECONDS = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UsageError extends Error {}

/** Aynada yüklenmeyecek adlar: yedek günlüğü, yarım indirmeler, nokta dosyaları. */
/** @param {string} name */
export function isExcludedName(name) {
  return name === "yedek.log" || name.endsWith(".part") || name.startsWith(".");
}

/** @param {string} value */
export function isValidDateArg(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** @type {Record<string, string>} */
const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  pdf: "application/pdf",
};

/** İçerik tipi uzantıdan (bucket'ta MIME kısıtı yok — KURULUM Adım 4). */
/** @param {string} path */
export function mimeFromPath(path) {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "application/octet-stream";
  return MIME[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

/** Storage yolunu URL'e çevirir (her parça ayrı kodlanır, "/" korunur). */
/** @param {string} path */
export function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// ---------------------------------------------------------------------------
// Argümanlar
// ---------------------------------------------------------------------------

/**
 * @typedef {{ env: string, hedef: string, kaynak: string, yukle: boolean,
 *             onek: string | null, silinenlerDahil: string | null }} RestoreOptions
 */

/**
 * @param {string[]} argv
 * @returns {RestoreOptions}
 */
export function parseArgs(argv) {
  /** @type {{ env: string | null, hedef: string | null, kaynak: string, yukle: boolean, onek: string | null, silinenlerDahil: string | null }} */
  const opts = {
    env: null,
    hedef: null,
    kaynak: "/var/backups/storage",
    yukle: false,
    onek: null,
    silinenlerDahil: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${arg} için değer gerekli.`);
      i++;
      return v;
    };
    if (arg === "--env") opts.env = value();
    else if (arg === "--hedef") opts.hedef = value();
    else if (arg === "--kaynak") opts.kaynak = value();
    else if (arg === "--yukle") opts.yukle = true;
    else if (arg === "--onek") opts.onek = value();
    else if (arg === "--silinenler-dahil") opts.silinenlerDahil = value();
    else throw new UsageError(`Bilinmeyen seçenek: ${arg}`);
  }
  if (!opts.env) throw new UsageError("--env <dosya> zorunlu (hedef projenin ortam dosyası).");
  if (!opts.hedef) throw new UsageError("--hedef <project-ref> zorunlu.");
  if (opts.onek !== null && !UUID_RE.test(opts.onek)) {
    throw new UsageError(`--onek bir kurum UUID'si olmalı (küçük harf): ${opts.onek}`);
  }
  if (opts.silinenlerDahil !== null && !isValidDateArg(opts.silinenlerDahil)) {
    throw new UsageError(`--silinenler-dahil YYYY-AA-GG olmalı: ${opts.silinenlerDahil}`);
  }
  return { ...opts, env: opts.env, hedef: opts.hedef };
}

// ---------------------------------------------------------------------------
// Yerel ayna
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, isDirectory: boolean, isFile: boolean }} DirEntry
 * @typedef {{ readdir(dir: string): Promise<DirEntry[]>, size(file: string): Promise<number> }} MirrorFs
 * @typedef {{ path: string, size: number, localPath: string }} LocalFile
 * @typedef {LocalFile & { date: string }} DeletedFile
 * @typedef {{ live: LocalFile[], deleted: DeletedFile[], excluded: string[] }} MirrorScan
 */

/** @param {DirEntry[]} entries */
function sortEntries(entries) {
  return entries.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Aynayı tarar. Canlı dosyalar `live`, _silinenler/{tarih}/ altındakiler
 * orijinal yollarıyla `deleted`. Hariç tutulanlar `excluded` (rapor için).
 * @param {MirrorFs} fs
 * @param {string} root
 * @returns {Promise<MirrorScan>}
 */
export async function walkMirror(fs, root) {
  /** @type {MirrorScan} */
  const scan = { live: [], deleted: [], excluded: [] };

  /**
   * @param {string} dirAbs
   * @param {string} rel
   * @param {string | null} date
   */
  async function walk(dirAbs, rel, date) {
    for (const entry of sortEntries(await fs.readdir(dirAbs))) {
      const abs = `${dirAbs}/${entry.name}`;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const shown = date ? `${SILINENLER_DIZIN}/${date}/${relPath}` : relPath;
      if (isExcludedName(entry.name)) {
        scan.excluded.push(shown);
        continue;
      }
      if (entry.isDirectory) {
        await walk(abs, relPath, date);
        continue;
      }
      if (!entry.isFile) {
        scan.excluded.push(shown); // symlink vb. — yüklenmez
        continue;
      }
      const size = await fs.size(abs);
      if (date) scan.deleted.push({ path: relPath, size, localPath: abs, date });
      else scan.live.push({ path: relPath, size, localPath: abs });
    }
  }

  for (const entry of sortEntries(await fs.readdir(root))) {
    if (entry.name === SILINENLER_DIZIN && entry.isDirectory) {
      const base = `${root}/${SILINENLER_DIZIN}`;
      for (const dated of sortEntries(await fs.readdir(base))) {
        if (dated.isDirectory && isValidDateArg(dated.name)) {
          await walk(`${base}/${dated.name}`, "", dated.name);
        } else {
          scan.excluded.push(`${SILINENLER_DIZIN}/${dated.name}`);
        }
      }
      continue;
    }
    const abs = `${root}/${entry.name}`;
    if (isExcludedName(entry.name)) {
      scan.excluded.push(entry.name);
    } else if (entry.isDirectory) {
      await walk(abs, entry.name, null);
    } else if (entry.isFile) {
      scan.live.push({ path: entry.name, size: await fs.size(abs), localPath: abs });
    } else {
      scan.excluded.push(entry.name);
    }
  }
  return scan;
}

/**
 * @typedef {LocalFile & { source: string }} SourceFile
 */

/**
 * Yüklenecek kaynak kümesi: kapsam (--onek) + isteğe bağlı _silinenler.
 * @param {MirrorScan} scan
 * @param {{ onek?: string | null, silinenlerDahil?: string | null }} [opts]
 * @returns {SourceFile[]}
 */
export function selectSources(scan, { onek = null, silinenlerDahil = null } = {}) {
  /** @param {string} p */
  const inScope = (p) => !onek || p.startsWith(`${onek}/`);
  /** @type {Map<string, SourceFile>} */
  const byPath = new Map();
  if (silinenlerDahil) {
    const eligible = scan.deleted
      .filter((d) => d.date >= silinenlerDahil && inScope(d.path))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // Tarih sırasıyla yazılır: aynı yol birden çok günde silinmişse EN YENİ kalır.
    for (const d of eligible) {
      byPath.set(d.path, {
        path: d.path,
        size: d.size,
        localPath: d.localPath,
        source: `${SILINENLER_DIZIN}/${d.date}`,
      });
    }
  }
  // Canlı ayna EN SON yazılır: aynı yol aynada da varsa ayna kazanır.
  for (const f of scan.live) {
    if (inScope(f.path)) byPath.set(f.path, { ...f, source: "ayna" });
  }
  return Array.from(byPath.values()).sort((a, b) => (a.path < b.path ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Hedef bucket listesi
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, id?: string | null, metadata?: { size?: number } | null }} StorageItem
 * @typedef {(prefix: string, offset: number, limit: number) => Promise<StorageItem[]>} ListPage
 */

/**
 * Bucket'ı rekursif listeler → yol → boyut (bilinmiyorsa null).
 * Klasör: id ve metadata YOK (Supabase list() cevabı).
 * @param {ListPage} listPage
 * @param {string} [rootPrefix]  "" = tüm bucket; ör. "<tenant-uuid>"
 * @param {number} [pageSize]
 * @returns {Promise<Map<string, number | null>>}
 */
export async function listRemoteFiles(listPage, rootPrefix = "", pageSize = LIST_PAGE_SIZE) {
  /** @type {Map<string, number | null>} */
  const files = new Map();
  const queue = [rootPrefix];
  while (queue.length > 0) {
    const prefix = /** @type {string} */ (queue.shift());
    let offset = 0;
    for (let page = 0; ; page++) {
      if (page >= LIST_MAX_PAGES) {
        throw new Error(`Listeleme sınırı aşıldı (${LIST_MAX_PAGES} sayfa): "${prefix}"`);
      }
      const items = await listPage(prefix, offset, pageSize);
      if (!items || items.length === 0) break; // YALNIZ boş sayfada dur
      for (const item of items) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = !item.id && !item.metadata;
        if (isFolder) queue.push(path);
        else files.set(path, typeof item.metadata?.size === "number" ? item.metadata.size : null);
      }
      offset += items.length;
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * @typedef {SourceFile & { remoteSize: number | null }} Conflict
 * @typedef {{ upload: SourceFile[], skip: SourceFile[], conflict: Conflict[] }} RestorePlan
 */

/**
 * @param {SourceFile[]} sources
 * @param {Map<string, number | null>} remote
 * @returns {RestorePlan}
 */
export function planRestore(sources, remote) {
  /** @type {RestorePlan} */
  const plan = { upload: [], skip: [], conflict: [] };
  for (const source of sources) {
    if (!remote.has(source.path)) {
      plan.upload.push(source);
      continue;
    }
    const remoteSize = remote.get(source.path) ?? null;
    // Boyutu bilinmeyen hedef dosya da çakışma: doğrulanamayanın üzerine yazılmaz.
    if (remoteSize === source.size) plan.skip.push(source);
    else plan.conflict.push({ ...source, remoteSize });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Yükleme
// ---------------------------------------------------------------------------

/** @typedef {"ok" | "exists" | "too-large" | "retry" | "error"} UploadKind */

/**
 * Storage API cevabını sınıflar. Eski sürümler 409/413'ü HTTP 400 + gövdede
 * statusCode ile döndürür — ikisi de karşılanır.
 * @param {{ status: number, bodyText?: string }} res
 * @returns {UploadKind}
 */
export function classifyUpload({ status, bodyText = "" }) {
  if (status >= 200 && status < 300) return "ok";
  /** @type {{ statusCode?: unknown, error?: unknown, message?: unknown }} */
  let body = {};
  try {
    body = JSON.parse(bodyText) ?? {};
  } catch {
    body = {};
  }
  const code = String(body.statusCode ?? "");
  const text = `${body.error ?? ""} ${body.message ?? ""} ${bodyText}`.toLowerCase();
  if (status === 409 || code === "409" || text.includes("duplicate") || text.includes("already exists")) {
    return "exists";
  }
  if (
    status === 413 ||
    code === "413" ||
    text.includes("maximum allowed size") ||
    text.includes("payload too large")
  ) {
    return "too-large";
  }
  if (status === 429 || status >= 500 || status === 0) return "retry";
  return "error";
}

/** @param {unknown} err */
export function errorCode(err) {
  const e = /** @type {{ code?: unknown, message?: unknown } | null} */ (err);
  if (e && typeof e.code === "string") return e.code;
  if (e && typeof e.message === "string") return e.message;
  return String(err);
}

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {{ kind: Exclude<UploadKind, "retry">, attempts: number, detail: string }} UploadOutcome
 * @typedef {(item: SourceFile) => Promise<{ status: number, bodyText?: string }>} Uploader
 */

/**
 * Tek dosya, en çok `tries` deneme. Yalnız 5xx / 429 / ağ hatası yeniden
 * denenir; 409 ve boyut sınırı hemen sonuçlanır.
 * @param {Uploader} upload
 * @param {SourceFile} item
 * @param {{ tries?: number, sleep?: (ms: number) => Promise<void>, delaysMs?: number[] }} [opts]
 * @returns {Promise<UploadOutcome>}
 */
export async function uploadWithRetry(
  upload,
  item,
  { tries = UPLOAD_TRIES, sleep = defaultSleep, delaysMs = [1000, 3000] } = {}
) {
  let detail = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await upload(item);
      const kind = classifyUpload(res);
      if (kind !== "retry") {
        return { kind, attempts: attempt, detail: kind === "ok" ? "" : `HTTP ${res.status} ${(res.bodyText ?? "").slice(0, 200)}` };
      }
      detail = `HTTP ${res.status} ${(res.bodyText ?? "").slice(0, 200)}`;
    } catch (err) {
      detail = errorCode(err);
    }
    if (attempt < tries) await sleep(delaysMs[Math.min(attempt - 1, delaysMs.length - 1)]);
  }
  return { kind: "error", attempts: tries, detail: detail.trim() };
}

/**
 * Sabit sayıda eşzamanlı işçi; sonuç sırası girdiyle aynı.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function runPool(items, concurrency, worker) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

// ---------------------------------------------------------------------------
// Son doğrulama ve bütün akış
// ---------------------------------------------------------------------------

/**
 * @param {SourceFile[]} sources
 * @param {Map<string, number | null>} remoteAfter
 */
export function compareAfter(sources, remoteAfter) {
  /** @type {string[]} */
  const missing = [];
  /** @type {Array<{ path: string, local: number, remote: number | null }>} */
  const sizeMismatch = [];
  for (const s of sources) {
    if (!remoteAfter.has(s.path)) missing.push(s.path);
    else if (remoteAfter.get(s.path) !== s.size) {
      sizeMismatch.push({ path: s.path, local: s.size, remote: remoteAfter.get(s.path) ?? null });
    }
  }
  const sourcePaths = new Set(sources.map((s) => s.path));
  const extra = Array.from(remoteAfter.keys()).filter((p) => !sourcePaths.has(p));
  return { missing, sizeMismatch, extra };
}

/**
 * @typedef {{
 *   plan: RestorePlan,
 *   uploaded: SourceFile[],
 *   exists: SourceFile[],
 *   tooLarge: Array<SourceFile & { detail: string }>,
 *   errors: Array<SourceFile & { detail: string }>,
 *   verify: ReturnType<typeof compareAfter> | null,
 *   write: boolean,
 * }} RestoreReport
 */

/**
 * Plan → (--yukle ise) yükleme → hedefi yeniden listeleyip karşılaştırma.
 * RAPOR modunda yükleyici HİÇ çağrılmaz.
 * @param {{
 *   sources: SourceFile[],
 *   remoteBefore: Map<string, number | null>,
 *   write: boolean,
 *   upload: Uploader,
 *   relist: () => Promise<Map<string, number | null>>,
 *   concurrency?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   onResult?: (item: SourceFile, outcome: UploadOutcome) => void,
 * }} args
 * @returns {Promise<RestoreReport>}
 */
export async function runRestore({
  sources,
  remoteBefore,
  write,
  upload,
  relist,
  concurrency = UPLOAD_CONCURRENCY,
  sleep,
  onResult,
}) {
  const plan = planRestore(sources, remoteBefore);
  /** @type {RestoreReport} */
  const report = { plan, uploaded: [], exists: [], tooLarge: [], errors: [], verify: null, write };
  if (!write) return report;

  const outcomes = await runPool(plan.upload, concurrency, async (item) => {
    const outcome = await uploadWithRetry(upload, item, sleep ? { sleep } : {});
    onResult?.(item, outcome);
    return outcome;
  });
  outcomes.forEach((outcome, i) => {
    const item = plan.upload[i];
    if (outcome.kind === "ok") report.uploaded.push(item);
    else if (outcome.kind === "exists") report.exists.push(item);
    else if (outcome.kind === "too-large") report.tooLarge.push({ ...item, detail: outcome.detail });
    else report.errors.push({ ...item, detail: outcome.detail });
  });

  report.verify = compareAfter(sources, await relist());
  return report;
}

/**
 * Çıkış kodu: hata, boyut sınırı, çakışma ya da son doğrulamada eksik/boyut
 * farkı varsa 1; aksi halde 0. (Kullanım ve hedef hataları script'te 2.)
 * @param {RestoreReport} report
 */
export function restoreExitCode(report) {
  if (report.plan.conflict.length > 0) return 1;
  if (!report.write) return 0;
  if (report.errors.length > 0 || report.tooLarge.length > 0) return 1;
  if (report.verify && (report.verify.missing.length > 0 || report.verify.sizeMismatch.length > 0)) {
    return 1;
  }
  return 0;
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}
