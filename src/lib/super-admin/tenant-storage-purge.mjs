// @ts-check
/**
 * Silinmiş bir kurumun storage dosyalarını temizler.
 *
 * Ortak kullanıcılar:
 *  - api/super-admin/delete-tenant → kurum DB'den BAŞARIYLA silindikten SONRA,
 *    en iyi çabayla, 20 sn süre bütçesiyle.
 *  - scripts/sweep-orphan-storage.mjs → geçmiş / kalan yetim klasörler;
 *    varsayılan rapor (dry-run), silme ancak açık onayla.
 *
 * NEDEN .mjs (projenin geri kalanı TS iken): süpürücü script Node 20'de de
 * çalışabilmeli (VPS Node 20; .ts'yi doğrudan çalıştırmak Node 22.6+ ister).
 * Guard'lar TEK yerde kalsın diye — kopyalanan güvenlik kodu zamanla ayrışır —
 * modül düz JS + JSDoc tipleri; TS bu dosyayı allowJs ile tipleriyle okur
 * (@ts-check açık). Bilerek importsuz: Supabase client parametredir.
 *
 * GUARD'LAR (servis anahtarı storage RLS'ini ATLAR — koruma bu koddadır):
 *  1. tenantId geçerli, küçük harfli bir UUID olmalı. Boş/bozuk değer ASLA
 *     geçmez: list("") bucket KÖKÜNÜ, yani TÜM kurumları listeler.
 *  2. Varsayılan kurumun sabit UUID'si her koşulda reddedilir.
 *  3. Kurum `tenants`'ta VARSA hiçbir şeye dokunulmaz — listelemeden önce ve
 *     silmeden HEMEN ÖNCE iki kez sorulur; sorgu hata verirse de dokunulmaz
 *     (fail-closed).
 *  4. Silinecek her yol SEGMENT kontrolünden geçer: ilk segment tam olarak
 *     tenantId (lib/storage.ts isOwnedPath deseni — düz prefix yanılması
 *     "abc" → "abcdef/…" yok); "", ".", ".." ya da "/" içeren segment reddedilir.
 *  5. Silme yalnız Storage API `.remove()` ile. storage.objects'ten SQL
 *     DELETE satırı siler ama dosyayı depolamada YETİM bırakır.
 *
 * Geri dönüş yolu: storage yedeği (scripts/backup-storage.mjs, gece 04:30)
 * silinen dosyaları 30 gün `_silinenler/` altında tutar.
 */

export const STORAGE_BUCKET = "images";

/** Varsayılan kurum — 001_seed_default.sql / 009'daki sabit UUID. ASLA temizlenmez. */
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/** Tek `.remove()` çağrısındaki dosya sayısı. */
export const PURGE_BATCH_SIZE = 100;

/** `list()` sayfa boyutu (backup-storage.mjs ile aynı). */
export const LIST_PAGE_SIZE = 100;

/**
 * delete-tenant route'unun storage adımına ayrılan süre. nginx isteği 60 sn'de
 * keser; kurum silme + hesap temizliği + yanıt için pay bırakılır. Sığmayan
 * dosyalar 207 ile raporlanır, süpürücü script sonra temizler.
 */
export const ROUTE_STORAGE_BUDGET_MS = 20_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Sonsuz döngü emniyeti (tek klasör seviyesi için list çağrısı sınırı). */
const MAX_LIST_CALLS = 10_000;

/**
 * @typedef {Object} StorageEntry
 * @property {string} name
 * @property {string | null} [id]          Klasörlerde null
 * @property {{ size?: number } | null} [metadata]
 */

/**
 * @typedef {Object} PurgeResult
 * @property {"done" | "partial" | "refused"} status
 * @property {"invalid-tenant-id" | "default-tenant" | "tenant-exists" | "tenant-check-failed" | null} reason
 * @property {number} listed           Listelenen dosya sayısı
 * @property {number} removed          Silinen dosya sayısı
 * @property {number} remaining        Listelenip silinemeyen (listeleme eksikse gerçek kalan daha fazla)
 * @property {boolean} listingComplete
 * @property {boolean} timedOut
 * @property {number} skippedForeign   Guard 4'ü geçemeyip ATLANAN yol (0 olmalı)
 * @property {string | null} error
 */

/**
 * Küçük harfli kanonik UUID mi? (Postgres UUID'i ve storage klasör adları
 * küçük harf.)
 * @param {unknown} value
 * @returns {value is string}
 */
export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Temizlenebilir kurum kimliği mi? Geçerli UUID ve varsayılan kurum DEĞİL.
 * @param {unknown} tenantId
 * @returns {tenantId is string}
 */
export function isPurgeableTenantId(tenantId) {
  return isUuid(tenantId) && tenantId !== DEFAULT_TENANT_ID;
}

/**
 * Tek bir yol parçası güvenli mi? Boş, ".", ".." ya da "/" içeren ad
 * (normalizasyonla başka klasöre kayabilecek her şey) reddedilir.
 * @param {string} segment
 * @returns {boolean}
 */
function isSafeSegment(segment) {
  return segment !== "" && segment !== "." && segment !== ".." && !segment.includes("/");
}

/**
 * Yol bu kuruma mı ait? SEGMENT karşılaştırması: ilk segment TAM OLARAK
 * tenantId, en az bir alt segment var (klasör adının kendisi dosya değil) ve
 * hiçbir segment "", "." ya da ".." değil.
 * @param {string} path
 * @param {string} tenantId
 * @returns {boolean}
 */
export function isTenantOwnedPath(path, tenantId) {
  if (typeof path !== "string" || !isPurgeableTenantId(tenantId)) return false;
  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (!segments.every(isSafeSegment)) return false;
  return segments[0] === tenantId;
}

/**
 * Bir klasör seviyesindeki TÜM kayıtlar (sayfalı). backup-storage.mjs dersi:
 * sunucu istenenden AZ kayıt dönebilir → "az geldi = bitti" DENMEZ; yalnız
 * BOŞ sayfada durulur ve offset dönen kayıt kadar ilerletilir.
 * @param {any} admin
 * @param {string} bucket
 * @param {string} prefix   "" = bucket kökü (yalnız süpürücünün keşif adımı)
 * @param {{ pageSize: number, deadline: number, now: () => number }} opts
 * @returns {Promise<{ entries: StorageEntry[], complete: boolean, timedOut: boolean, error: string | null }>}
 */
async function listFolderEntries(admin, bucket, prefix, { pageSize, deadline, now }) {
  /** @type {StorageEntry[]} */
  const entries = [];
  let offset = 0;

  for (let calls = 0; calls < MAX_LIST_CALLS; calls++) {
    if (now() >= deadline) return { entries, complete: false, timedOut: true, error: null };

    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      return {
        entries,
        complete: false,
        timedOut: false,
        error: `list('${prefix || "/"}'): ${error.message}`,
      };
    }
    if (!data || data.length === 0) return { entries, complete: true, timedOut: false, error: null };

    entries.push(...data);
    offset += data.length;
  }

  return {
    entries,
    complete: false,
    timedOut: false,
    error: `list('${prefix || "/"}'): çağrı sınırı aşıldı`,
  };
}

/**
 * Kurum klasöründeki TÜM dosyalar — özyinelemeli (klasörler id === null döner,
 * içine dalınır) ve sayfalı. `.emptyFolderPlaceholder` da bir nesnedir →
 * dosya sayılır (klasör tamamen boşalsın). Güvensiz adlı kayıtlar (Guard 4)
 * ne gezilir ne silinir; `skipped`'e yazılır.
 * @param {any} admin
 * @param {string} tenantId
 * @param {{ bucket?: string, pageSize?: number, deadline?: number, now?: () => number }} [opts]
 * @returns {Promise<{ files: { path: string, size: number | null }[], skipped: string[], complete: boolean, timedOut: boolean, error: string | null }>}
 */
export async function listTenantFiles(admin, tenantId, opts = {}) {
  if (!isPurgeableTenantId(tenantId)) {
    // Guard 1-2: kök ya da varsayılan kurum ASLA listelenmez.
    return { files: [], skipped: [], complete: false, timedOut: false, error: "gecersiz-kurum" };
  }
  const bucket = opts.bucket ?? STORAGE_BUCKET;
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const now = opts.now ?? Date.now;

  /** @type {{ path: string, size: number | null }[]} */
  const files = [];
  /** @type {string[]} */
  const skipped = [];
  const folders = [tenantId];

  while (folders.length > 0) {
    const prefix = /** @type {string} */ (folders.pop());
    const level = await listFolderEntries(admin, bucket, prefix, { pageSize, deadline, now });

    for (const entry of level.entries) {
      const path = `${prefix}/${entry.name}`;
      if (!isSafeSegment(entry.name)) {
        skipped.push(path);
      } else if (entry.id == null) {
        folders.push(path);
      } else {
        files.push({ path, size: entry.metadata?.size ?? null });
      }
    }

    if (!level.complete) {
      return { files, skipped, complete: false, timedOut: level.timedOut, error: level.error };
    }
  }

  return { files, skipped, complete: true, timedOut: false, error: null };
}

/**
 * Kurum `tenants`'ta var mı? Üç durum: true / false / null (sorgu hatası →
 * çağıran DOKUNMAZ).
 * @param {any} admin
 * @param {string} tenantId
 * @returns {Promise<boolean | null>}
 */
export async function tenantExists(admin, tenantId) {
  const { data, error } = await admin
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) return null;
  return !!data;
}

/**
 * Silinmiş bir kurumun storage klasörünü temizler (Guard 1-5, bkz. dosya başı).
 * @param {any} admin     Servis anahtarlı Supabase client
 * @param {string} tenantId
 * @param {{ bucket?: string, batchSize?: number, pageSize?: number, budgetMs?: number, now?: () => number, log?: (message: string, detail?: unknown) => void }} [opts]
 * @returns {Promise<PurgeResult>}
 */
export async function purgeTenantStorage(admin, tenantId, opts = {}) {
  const bucket = opts.bucket ?? STORAGE_BUCKET;
  const batchSize = opts.batchSize ?? PURGE_BATCH_SIZE;
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((message, detail) => console.error(message, detail ?? ""));
  const deadline =
    opts.budgetMs == null ? Number.POSITIVE_INFINITY : now() + opts.budgetMs;

  /**
   * @param {PurgeResult["reason"]} reason
   * @param {number} [listed]
   * @returns {PurgeResult}
   */
  const refuse = (reason, listed = 0) => ({
    status: "refused",
    reason,
    listed,
    removed: 0,
    remaining: listed,
    listingComplete: false,
    timedOut: false,
    skippedForeign: 0,
    error: null,
  });

  // Guard 1-2: kimlik
  if (!isUuid(tenantId)) return refuse("invalid-tenant-id");
  if (tenantId === DEFAULT_TENANT_ID) return refuse("default-tenant");

  // Guard 3a: kurum kayıtlıysa listelemeye bile girilmez
  const existsBefore = await tenantExists(admin, tenantId);
  if (existsBefore === null) return refuse("tenant-check-failed");
  if (existsBefore) return refuse("tenant-exists");

  const listing = await listTenantFiles(admin, tenantId, { bucket, pageSize, deadline, now });

  // Guard 4: her yol segment kontrolünden geçmeli
  /** @type {string[]} */
  const owned = [];
  const skipped = [...listing.skipped];
  for (const file of listing.files) {
    if (isTenantOwnedPath(file.path, tenantId)) owned.push(file.path);
    else skipped.push(file.path);
  }
  if (skipped.length > 0) {
    log(
      `[tenant-storage-purge] ${tenantId}: guard'ı geçemeyen ${skipped.length} yol ATLANDI:`,
      skipped
    );
  }

  // Guard 3b: silmeden HEMEN ÖNCE tekrar sor
  if (owned.length > 0) {
    const existsNow = await tenantExists(admin, tenantId);
    if (existsNow === null) return refuse("tenant-check-failed", listing.files.length);
    if (existsNow) return refuse("tenant-exists", listing.files.length);
  }

  // Guard 5: yalnız Storage API .remove(); 100'lük gruplar, süre bütçesi
  let removed = 0;
  let timedOut = listing.timedOut;
  let error = listing.error;

  for (let i = 0; i < owned.length; i += batchSize) {
    if (now() >= deadline) {
      timedOut = true;
      break;
    }
    const batch = owned.slice(i, i + batchSize);
    const { data, error: removeError } = await admin.storage.from(bucket).remove(batch);
    if (removeError) {
      error = error ?? `remove: ${removeError.message}`;
      log(`[tenant-storage-purge] ${tenantId}: ${batch.length} dosyalık grup silinemedi:`, removeError);
      continue; // gruplar bağımsız — kalanlar denenir
    }
    removed += Array.isArray(data) ? data.length : 0;
  }

  const remaining = owned.length - removed;
  const done =
    listing.complete && !timedOut && remaining === 0 && skipped.length === 0 && error === null;

  return {
    status: done ? "done" : "partial",
    reason: null,
    listed: listing.files.length,
    removed,
    remaining,
    listingComplete: listing.complete,
    timedOut,
    skippedForeign: skipped.length,
    error,
  };
}

/**
 * Süper admin uyarısı için kısa açıklama; temizlik tamsa null.
 * @param {Pick<PurgeResult, "status" | "reason" | "remaining" | "skippedForeign" | "listingComplete" | "timedOut" | "error"> | null | undefined} result
 * @returns {string | null}
 */
export function describeStorageLeftover(result) {
  if (!result || result.status === "done") return null;

  if (result.status === "refused") {
    if (result.reason === "tenant-exists") return "dosyalara dokunulmadı (kurum hâlâ kayıtlı)";
    if (result.reason === "tenant-check-failed") {
      return "dosyalar silinmedi (kurum kontrolü yapılamadı)";
    }
    return "dosyalar silinmedi (geçersiz kurum)";
  }

  const cause = result.timedOut
    ? "süre sınırı"
    : result.error
      ? "silme/listeleme hatası"
      : "güvenlik kontrolünü geçemeyen yol";
  const left = result.remaining + result.skippedForeign;

  if (!result.listingComplete && left === 0) {
    return `dosyaların bir kısmı depolamada kalmış olabilir (${cause})`;
  }
  return `${result.listingComplete ? "" : "en az "}${left} dosya depolamada kaldı (${cause})`;
}

// ---------------------------------------------------------------------------
// Süpürücü (scripts/sweep-orphan-storage.mjs) yardımcıları
// ---------------------------------------------------------------------------

/**
 * Bucket kökündeki kayıtlar (klasörler + kökteki dosyalar), sayfalı.
 * Kökü listelemenin TEK meşru yeri burası (salt okuma, keşif) — silme yolu
 * (purgeTenantStorage) kökü asla listelemez.
 * @param {any} admin
 * @param {{ bucket?: string, pageSize?: number }} [opts]
 * @returns {Promise<StorageEntry[]>}
 */
export async function listRootEntries(admin, opts = {}) {
  const result = await listFolderEntries(admin, opts.bucket ?? STORAGE_BUCKET, "", {
    pageSize: opts.pageSize ?? LIST_PAGE_SIZE,
    deadline: Number.POSITIVE_INFINITY,
    now: Date.now,
  });
  if (!result.complete) throw new Error(result.error ?? "bucket kökü listelenemedi");
  return result.entries;
}

/**
 * `tenants` tablosundaki TÜM kurum kimlikleri. Satır üst sınırı (Supabase
 * "Max rows") yanıtı sessizce keserse kayıtlı bir kurum "yetim" görünürdü →
 * range sayfalama + toplam sayıya ulaşana dek devam (orphan-users.ts deseni).
 * @param {any} admin
 * @returns {Promise<string[]>}
 */
export async function fetchAllTenantIds(admin) {
  const pageSize = 1000;
  /** @type {string[]} */
  const ids = [];
  let from = 0;
  /** @type {number | null} */
  let total = null;

  for (let i = 0; i < 50; i++) {
    const { data, error, count } = await admin
      .from("tenants")
      .select("id", { count: "exact" })
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`tenants okunamadı: ${error.message}`);
    if (total === null) total = count ?? Number.POSITIVE_INFINITY;

    const rows = /** @type {{ id: string }[]} */ (data ?? []);
    for (const row of rows) ids.push(row.id);
    from += rows.length;
    if (rows.length === 0 || from >= /** @type {number} */ (total)) return ids;
  }
  throw new Error("tenants okunamadı: sayfalama sınırı aşıldı");
}

/**
 * Kök kayıtlarını sınıflar (saf).
 *  - orphans: UUID adlı KLASÖR, `tenants`'ta yok, varsayılan kurum değil.
 *  - unknown: tanınmayan her şey (kökteki dosyalar, UUID olmayan klasörler,
 *    kaydı eksik varsayılan kurum klasörü) — rapora yazılır, ASLA silinmez.
 * @param {StorageEntry[]} rootEntries
 * @param {Iterable<string>} tenantIds
 * @returns {{ orphans: string[], unknown: string[] }}
 */
export function findOrphanTenantFolders(rootEntries, tenantIds) {
  const known = new Set(tenantIds);
  /** @type {string[]} */
  const orphans = [];
  /** @type {string[]} */
  const unknown = [];

  for (const entry of rootEntries) {
    const isFolder = entry.id == null;
    if (isFolder && known.has(entry.name)) continue; // kayıtlı kurum — normal
    if (isFolder && isPurgeableTenantId(entry.name)) orphans.push(entry.name);
    else unknown.push(entry.name);
  }
  return { orphans: orphans.sort(), unknown: unknown.sort() };
}

/**
 * Süpürücünün "açık onay" adımı (saf): yalnız bu koşumda YENİDEN bulunan
 * yetim klasörler kabul edilir; her ret gerekçesiyle döner.
 * @param {string[]} requested  --sil ile verilen UUID'ler
 * @param {string[]} orphans    Bu koşumda bulunan yetim klasörler
 * @returns {{ accepted: string[], rejected: { id: string, reason: string }[] }}
 */
export function resolveSweepTargets(requested, orphans) {
  const orphanSet = new Set(orphans);
  /** @type {string[]} */
  const accepted = [];
  /** @type {{ id: string, reason: string }[]} */
  const rejected = [];

  for (const id of Array.from(new Set(requested))) {
    if (!isUuid(id)) rejected.push({ id, reason: "geçerli (küçük harfli) bir UUID değil" });
    else if (id === DEFAULT_TENANT_ID) rejected.push({ id, reason: "varsayılan kurum — asla temizlenmez" });
    else if (!orphanSet.has(id)) {
      rejected.push({ id, reason: "yetim klasör değil (kurum kayıtlı ya da klasör yok)" });
    } else accepted.push(id);
  }
  return { accepted, rejected };
}
