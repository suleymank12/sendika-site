/**
 * SUPABASE ISTEKLERI ICIN ZAMAN ASIMLI FETCH — tek kaynak (Supabase kesinti
 * dayanikliligi C3, 24 Eylul 2026).
 *
 * NEDEN: Supabase istemcilerinde hic zaman asimi yoktu; tek sinir undici'nin
 * 10 sn baglanti / 300 sn yanit sureleriydi (olay: sayfalar 7–20 sn). Her
 * sunucu istemci fabrikasi `global.fetch`'i buradan alir; katmana gore butce:
 *
 *   middleware     4 sn   (ozel alan adi sorgusu, getUser)
 *   public-okuma   5 sn   (public sayfalar, kurum sorgusu)
 *   admin-okuma    6 sn   (admin/super admin layout'lari, API okumalari)
 *   yazma         25 sn   (sunucu yazmalari — KISA zaman asimi YOK; ust
 *                         sinirda "sonuc dogrulanamadi", bkz. zamanAsimiMi)
 *
 * 🔴 Zaman asimi asla "yok", "yetkisiz" ya da "girisli" anlamina GELMEZ:
 * fetch `TimeoutError` ile reddedilir → PostgREST `{ error }`, auth-js
 * `AuthRetryableFetchError` (tasima) → mevcut "gecici hata" dallari
 * (C2/C7/C8, middleware 503).
 *
 * Kesinti yaniti ≈ 2 × butce (Next 14 hata kabugu cift render'i; NOTE).
 *
 * Web API'leriyle yazildi (Edge sandbox'ta da calisir). OLCULDU (24 Eylul
 * 2026, next/dist/compiled/edge-runtime): AbortSignal.timeout VAR,
 * AbortSignal.any YOK → caginanin sinyali elle baglanir.
 *
 * Butce CAGRI basina ve yanitin GOVDESI dahil (sinyal fetch'e verilir,
 * govde okunurken de gecerlidir).
 */

export type SupabaseKatmani = "middleware" | "public-okuma" | "admin-okuma" | "yazma";

export const SUPABASE_BUTCE_MS: Readonly<Record<SupabaseKatmani, number>> = {
  middleware: 4_000,
  "public-okuma": 5_000,
  "admin-okuma": 6_000,
  yazma: 25_000,
};

/** Zaman asimi hatalarinin mesajindaki tanimlayici (log ve zamanAsimiMi). */
export const ZAMAN_ASIMI_ISARETI = "supabase-zaman-asimi";

/** Ag sinifina cevrilen 5xx hatalarinin mesajindaki tanimlayici (C3 v2). */
export const AG_5XX_ISARETI = "supabase-5xx";

/**
 * AG SINIFI 5xx (C3 v2, 25 Eylul 2026 — kullanici karari): Cloudflare'in
 * 520–527 sayfalari ve govdesi JSON olmayan her 5xx, Supabase'e hic
 * ulasamamis bir istegin izidir; fetch REDDEDILIR (ag hatasi gibi).
 *
 * NEDEN (auth-js 2.101.1, node_modules'ta okundu): lib/fetch.js yalniz
 * 502/503/504'u yeniden denenebilir sayar. 522 + HTML govde `error.json()`'da
 * duser → AuthUnknownError (yeniden denenmez) → `_callRefreshToken`
 * `_removeSession()` → kesintide OTURUM SILINIR. Fetch reddi ise
 * `_handleRequest` catch'inde AuthRetryableFetchError olur → yeniden denenir,
 * oturum korunur. PostgREST/storage'da sonuc ayni kalir (gecici hata dali).
 *
 * JSON govdeli 5xx (PostgREST'in kendi hatasi) DONUSTURULMEZ.
 */
export class SupabaseAgHatasi extends Error {
  constructor(durum: number, govde: string) {
    super(`${AG_5XX_ISARETI}: durum ${durum} · ${kisaHata(govde)}`);
    this.name = "SupabaseAgHatasi";
  }
}

function agSinifi5xx(durum: number, govde: string): boolean {
  if (durum < 500 || durum > 599) return false;
  if (durum >= 520 && durum <= 527) return true;
  try {
    JSON.parse(govde);
    return false;
  } catch {
    return true;
  }
}

export function zamanAsimliFetch(katman: SupabaseKatmani): typeof fetch {
  const butce = SUPABASE_BUTCE_MS[katman];
  return (girdi, init) => {
    const denetci = new AbortController();
    const zamanlayici = setTimeout(() => {
      denetci.abort(new DOMException(`${ZAMAN_ASIMI_ISARETI}: ${katman} ${butce} ms`, "TimeoutError"));
    }, butce);
    const cagiran = init?.signal;
    if (cagiran) {
      if (cagiran.aborted) denetci.abort(cagiran.reason);
      else cagiran.addEventListener("abort", () => denetci.abort(cagiran.reason), { once: true });
    }
    return fetch(girdi, { ...init, signal: denetci.signal }).then(
      async (yanit) => {
        // zamanlayici govde okunana kadar yasar (butce govdeyi de kapsar)
        if (yanit.status < 500) return yanit;
        let govde: string;
        try {
          govde = await yanit.text();
        } finally {
          clearTimeout(zamanlayici);
        }
        if (agSinifi5xx(yanit.status, govde)) throw new SupabaseAgHatasi(yanit.status, govde);
        return new Response(govde, { status: yanit.status, statusText: yanit.statusText, headers: yanit.headers });
      },
      (hata) => {
        clearTimeout(zamanlayici);
        throw hata;
      }
    );
  };
}

/** Supabase hatasi (PostgREST/auth/storage/fetch) BIZIM zaman asimimizdan mi? */
export function zamanAsimiMi(hata: unknown): boolean {
  if (!hata) return false;
  const parca = (x: unknown) => (typeof x === "string" ? x : "");
  const h = hata as { message?: unknown; details?: unknown; name?: unknown };
  return [h.message, h.details, h.name].some((x) => parca(x).includes(ZAMAN_ASIMI_ISARETI));
}

/**
 * LOG KISALTMA (C3): Cloudflare/Supabase hata sayfalari (HTML) log'a oldugu
 * gibi basiliyordu. HTML atilir, bosluklar tek, en cok 300 karakter; durum
 * kodu + kisa neden.
 */
export function kisaHata(hata: unknown): string {
  if (hata === null || hata === undefined) return "(hata yok)";
  const h = hata as { status?: unknown; code?: unknown; name?: unknown; message?: unknown; details?: unknown };
  const parcalar: string[] = [];
  if (typeof h.status === "number") parcalar.push(`durum ${h.status}`);
  if (typeof h.code === "string" && h.code) parcalar.push(`kod ${h.code}`);
  if (typeof h.name === "string" && h.name && h.name !== "Error") parcalar.push(h.name);
  let metin = typeof h.message === "string" ? h.message : typeof hata === "string" ? hata : String(hata);
  if (typeof h.details === "string" && h.details && !metin.includes(h.details.slice(0, 40))) metin += ` — ${h.details}`;
  if (/<(!doctype|html|head|body)\b/i.test(metin)) {
    const baslik = metin.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    metin = `[HTML govde atildi${baslik ? `: ${baslik}` : ""}]`;
  }
  metin = metin.replace(/\s+/g, " ").trim();
  const sonuc = [...parcalar, metin].join(" · ");
  return sonuc.length > 300 ? sonuc.slice(0, 297) + "…" : sonuc;
}
