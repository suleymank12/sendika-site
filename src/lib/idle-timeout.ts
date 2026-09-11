/**
 * Oturum zaman asimi — SAF mantik (React / DOM yok).
 *
 * Kullanan: hooks/useIdleTimeout.tsx. Test: scripts/test-idle-timeout.mjs bu
 * dosyayi dogrudan import eder (Node type stripping); bu yuzden BASKA MODUL
 * IMPORT ETMEZ — sure (OTURUM_ZAMAN_ASIMI) hook'tan parametre olarak gelir.
 *
 * Karar ve gerekceler: NOTE.md "OTURUM ZAMAN ASIMI" (12 Eylul 2026).
 */

/** localStorage anahtari — ayni kokendeki tum sekmeler paylasir. */
export const IDLE_STORAGE_KEY = "oturum-son-etkinlik";

/**
 * Kontrol sikligi. Tek bir uzun setTimeout DEGIL: uyku ve tarayicinin arka
 * plan zamanlayici kisitlamasi (gizli sekmede dakikada bire kadar) onu
 * kaydirir; her kontrolde saat karsilastirildigi icin sonuc kaymaz.
 */
export const IDLE_CHECK_INTERVAL_MS = 15_000;

/** localStorage'a en fazla bu siklikta yazilir (yazarken her tusta degil). */
export const IDLE_WRITE_THROTTLE_MS = 10_000;

/**
 * Baska sekmenin kaydi en fazla bu kadar "ileride" olabilir. Daha ilerisi
 * (saat oynanmis / yanlis) inandirici degil ve YOK SAYILIR: simdiye kirpmak
 * yetmezdi — kayit her kontrolde "simdi" gibi gorunup oturumu suresiz acik
 * tutardi. Sekmeler ayni sistem saatini kullandigi icin mesru kayit ileride
 * olmaz; pay yalniz guvenlik icin.
 */
export const IDLE_FUTURE_TOLERANCE_MS = 60_000;

/**
 * Etkinlik sayilan olaylar (document'a capture ile baglanir — scroll
 * kabarcıklanmaz, capture onu da yakalar). Sayfa gecisi hook'ta ayrica
 * sayilir.
 *
 * BILEREK YOK:
 * - mousemove / pointermove: masa titresimi, optik fare kaymasi ekrani
 *   sonsuza dek acik tutar ("hic cikis olmaz" riskinin asil kaynagi).
 * - API / arka plan istekleri (token yenileme, okunmamis mesaj sayaci):
 *   sayilirsa basinda kimse olmayan ekran hic kapanmaz. Kullanicinin
 *   baslattigi istekler zaten tiklama / tusla sayiliyor.
 * - focus / visibilitychange: sekmeye donmek etkinlik degil — o anda
 *   yalnizca sure KONTROL edilir.
 */
export const IDLE_ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "touchstart",
  "wheel",
  "scroll",
  "input",
] as const;

/** Paylasilan kayit: son etkinlik zamani + ait oldugu oturum. */
export interface StoredActivity {
  /** epoch ms */
  t: number;
  /** oturum kimligi (JWT session_id) — baska oturumun kaydi yok sayilir */
  s: string;
}

export function parseStoredActivity(raw: string | null): StoredActivity | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredActivity> | null;
    if (
      v &&
      typeof v.t === "number" &&
      Number.isFinite(v.t) &&
      typeof v.s === "string" &&
      v.s !== ""
    ) {
      return { t: v.t, s: v.s };
    }
  } catch {
    // bozuk kayit — yok say
  }
  return null;
}

export function serializeActivity(t: number, s: string): string {
  return JSON.stringify({ t, s });
}

/**
 * Access token (JWT) payload'indaki session_id. Imza DOGRULANMAZ — deger
 * yalnizca sayaci oturuma baglamak icin kullanilir (yetki karari degil).
 * Her giriste yeni session_id uretilir; token yenilemede ayni kalir.
 */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { session_id?: unknown };
    return typeof claims.session_id === "string" && claims.session_id !== ""
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

/** Kayit ayni oturuma mi ait ve zamani inandirici mi (bkz. IDLE_FUTURE_TOLERANCE_MS)? */
export function isCredibleStored(
  stored: StoredActivity | null,
  sessionId: string | null,
  now: number
): stored is StoredActivity {
  return (
    stored !== null &&
    sessionId !== null &&
    stored.s === sessionId &&
    stored.t <= now + IDLE_FUTURE_TOLERANCE_MS
  );
}

/**
 * Oturum cozuldugunde (sekme acilisi / giris) sayacin baslangici.
 * - Ayni oturumun inandirici kaydi varsa ORADAN devam: yenileme, yeni sekme
 *   ve kapatilip saatler sonra acilan sekme. Kayit dolmussa ilk kontrol
 *   hemen cikar — ortak bilgisayar senaryosu tam olarak bu.
 * - Yoksa (yeni giris, davet, sifre sifirlama, temiz bitmemis eski oturumun
 *   kaydi) sayac SIMDI baslar ve kayit yazilir (fresh).
 */
export function initialActivity(
  stored: StoredActivity | null,
  sessionId: string,
  now: number
): { last: number; fresh: boolean } {
  if (isCredibleStored(stored, sessionId, now)) {
    return { last: Math.min(stored.t, now), fresh: false };
  }
  return { last: now, fresh: true };
}

/**
 * Son etkinlik: bu sekmenin bellegi ile ayni oturuma ait inandirici
 * paylasilan kaydin BUYUGU (baska sekmedeki etkinlik bu sekmeyi de canli
 * tutar). Bellek saat geri alininca ileride kalabilir -> simdiye kirpilir.
 */
export function effectiveLastActivity(
  memoryLast: number,
  stored: StoredActivity | null,
  sessionId: string | null,
  now: number
): number {
  let last = memoryLast;
  if (isCredibleStored(stored, sessionId, now) && stored.t > last) {
    last = stored.t;
  }
  return Math.min(last, now);
}

export function isIdleExpired(last: number, now: number, timeoutMs: number): boolean {
  return now - last >= timeoutMs;
}

export interface IdleInput {
  now: number;
  memoryLast: number;
  stored: StoredActivity | null;
  sessionId: string | null;
  /** surmekte olan tutma sayisi (yukleme) */
  holds: number;
  timeoutMs: number;
}

/** Tek kontrol adimi. Tutma varken sayac durur: son etkinlik = simdi. */
export function evaluateIdle(input: IdleInput): { last: number; expired: boolean } {
  if (input.holds > 0) return { last: input.now, expired: false };
  const last = effectiveLastActivity(
    input.memoryLast,
    input.stored,
    input.sessionId,
    input.now
  );
  return { last, expired: isIdleExpired(last, input.now, input.timeoutMs) };
}

export function shouldWriteActivity(lastWriteAt: number, now: number): boolean {
  return now - lastWriteAt >= IDLE_WRITE_THROTTLE_MS;
}

/**
 * Cikis sonrasi giris adresi. AdminLoginForm bu parametreleri okur:
 *   oturum=zaman-asimi  -> "Uzun sure islem yapilmadigi icin..." mesaji
 *   kaydedilmemis=1     -> "Kaydedilmemis degisiklikleriniz kaydedilemedi."
 *   next                -> girisle ayni sayfaya donus (AdminLoginForm isSafeNext)
 * Guvensiz next ("//host", "/\host", mutlak URL) yazilmaz.
 */
export function buildIdleLoginUrl(opts: {
  expired: boolean;
  dirty: boolean;
  next: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.expired) params.set("oturum", "zaman-asimi");
  if (opts.dirty) params.set("kaydedilmemis", "1");
  const next = opts.next;
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    params.set("next", next);
  }
  const query = params.toString();
  return query ? `/admin/giris?${query}` : "/admin/giris";
}
