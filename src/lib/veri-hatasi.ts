import { KurumGeciciHatasi } from "./get-tenant";
import { NOTR_HATA_METNI } from "./notr-hata";

export { NOTR_HATA_METNI };

/**
 * PUBLIC VERI HATASI — "yok" ile "hata" AYRI (Supabase kesinti dayanikliligi
 * C7, 24 Eylul 2026).
 *
 * Eskiden public sayfalar sorgu hatasini yutuyordu: liste/anasayfa BOS 200,
 * detay 404 (olculdu: raporlar/2026-09-24-1334-…). Bos 200 izlemeye
 * gorunmuyor, 404 arama motorunda sayfayi dizinden dusuruyor. Karar:
 * kesintide DURUST hata — notr 500 sayfasi (app/error.tsx,
 * app/global-error.tsx); route handler'larda (sitemap/robots) 503.
 *
 * Siniflar:
 *   - BIRINCIL (sayfanin varlik sebebi olan veri, layout ayar/menu,
 *     metadata'nin ayar okumasi): hata → FIRLAT (`hataVarsaFirlat`).
 *     Satir yoksa (hata yok) davranis AYNI: detayda 404, listede bos.
 *   - IKINCIL (gercekten yan parca, ör. "ilgili haberler"): hata → parca
 *     gizlenir + tek satir log (`ikincilHata`).
 *   Supheli durumda birincil.
 *
 * Hata AYRINTISI sayfaya gitmez, yalniz sunucu log'una.
 */
export class VeriOkumaHatasi extends Error {
  constructor(yer: string, mesaj: string) {
    super(`[veri] ${yer}: ${mesaj}`);
    this.name = "VeriOkumaHatasi";
  }
}

/**
 * Birincil okuma. Hata varsa FIRLATIR; yoksa `null` doner. Tek-kayit
 * okuyucularda `return (data as X) || hataVarsaFirlat(error, "…")`
 * bicimiyle: kayit varsa kayit, yoksa hata → firlat, hata da yoksa null.
 */
export function hataVarsaFirlat(error: { message?: string } | null | undefined, yer: string): null {
  if (error) throw new VeriOkumaHatasi(yer, error.message ?? "bilinmeyen hata");
  return null;
}

/** Ikincil okuma: hata varsa parca gizlenir, tek satir log. */
export function ikincilHata(error: { message?: string } | null | undefined, yer: string): void {
  if (error) console.error(`[veri] ikincil parca gizlendi (${yer}): ${error.message ?? "bilinmeyen hata"}`);
}

/** Kurum ya da veri okumasinin GECICI hatasi mi (route handler 503 karari). */
export function geciciHataMi(hata: unknown): boolean {
  return hata instanceof VeriOkumaHatasi || hata instanceof KurumGeciciHatasi;
}

/** Route handler'lar icin notr 503 (sitemap.xml, robots.txt). */
export function geciciHata503(): Response {
  return new Response(NOTR_HATA_METNI, {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": "30",
      "cache-control": "no-store",
    },
  });
}

/**
 * `Promise.all` icindeki kosullu sorgular `Promise.resolve({ data })` ile
 * bos gecilir; o nesnede `error` alani YOK. Bu yardimci ikisinden de hatayi
 * (varsa) okur.
 */
export function yanitHatasi(yanit: unknown): { message?: string } | null {
  if (yanit && typeof yanit === "object" && "error" in yanit) {
    return (yanit as { error: { message?: string } | null }).error ?? null;
  }
  return null;
}
