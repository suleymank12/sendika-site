import { NextResponse } from "next/server";
import { kisaHata, zamanAsimiMi } from "./supabase/zaman-asimli-fetch";

/**
 * SUNUCU YAZMASI HATA YANITI (Supabase kesinti dayanikliligi C3, 24 Eylul 2026).
 *
 * Yazmalarda kisa zaman asimi YOK; yalniz 25 sn ust sinir
 * (zaman-asimli-fetch "yazma"). Ust sinirda istemci tarafinda kesilen bir
 * yazma Supabase'de ISLENMIS OLABILIR — kullaniciya "basarisiz" demek onu
 * tekrar denemeye iter (cift kayit). Bu yuzden:
 *
 *   zaman asimi  → 504 { error: "Sonuç doğrulanamadı — …", sonuc: "belirsiz" }
 *   diger hata   → bugunku mesaj ve durum AYNEN
 *
 * Idempotency (istemci kimligi) bu turda yok.
 */
export const BELIRSIZ_MESAJ = "Sonuç doğrulanamadı — listeyi yenileyip kontrol edin.";

export function yazmaHataYaniti(hata: unknown, mesaj: string, durum = 500): NextResponse {
  if (zamanAsimiMi(hata)) {
    console.error("[yazma] sonuc belirsiz (zaman asimi):", kisaHata(hata));
    return NextResponse.json(
      { error: BELIRSIZ_MESAJ, sonuc: "belirsiz" },
      { status: 504, headers: { "cache-control": "no-store" } }
    );
  }
  return NextResponse.json({ error: mesaj }, { status: durum });
}
