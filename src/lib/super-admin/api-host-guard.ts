import { NextResponse, type NextRequest } from "next/server";
import { isSameHostOrigin, isSuperAdminHost } from "@/lib/tenant-hostname";

/**
 * API rotalari icin HOST politikasi (Deploy 2, 19 Eylul 2026).
 *
 * 🔴 NEDEN AYRI BIR KATMAN GEREKTI: `middleware.ts` matcher'i `api`'yi
 * DISLIYOR (`"/((?!_next/static|_next/image|favicon.ico|api).*)"`). Yani
 * middleware'deki iki host kurali API rotalarina HIC UGRAMAZ. Kural (b)
 * yalniz middleware'e konsaydi panelin UI'si tasinmis ama tehlikeli API
 * yuzeyi HER MUSTERI DOMAININDE acik kalmis olurdu:
 *
 *   https://kurmayteknoloji.com/api/super-admin/delete-tenant
 *
 * 8 route'un kendi `requireSuperAdmin` guard'i saglam ama yalniz "bu
 * KULLANICI super admin mi" diye soruyor — super adminlik kullanicinin
 * ozelligi, host'un degil. Super admin bir musteri host'unda oturum acmissa
 * (kuruma destek verirken) o host'taki cagri kabul ediliyordu.
 *
 * NEDEN MIDDLEWARE MATCHER'INA `api` EKLENMEDI: o secenek /api/contact
 * dahil TUM API'leri middleware'den gecirir ve her API istegine Supabase
 * auth ekler — olculmemis bir performans/davranis degisikligi. Guvenlik
 * duzeltmesiyle ayni tura sokulmadi (teshis turu karari, A secenegi).
 *
 * Yerlestirme kurali: her handler'in EN BASINDA, auth kontrolunden ONCE.
 * Reddedilecek istek icin Supabase istemcisi kurup `auth.getUser()`
 * cagirmak bosa is; ayrica host karari saf ve senkron oldugu icin
 * basarisiz olamaz.
 *
 * Test: scripts/test-super-admin-host.mjs — 8 route dosyasinin da bu
 * helper'i cagirdigini DOSYADAN SAYAR. Dokuzuncu route eklenip guard
 * unutulursa test kirilir.
 */

/** Super admin host'u disindan gelen istekte donen cevap. */
function notFound(): NextResponse {
  // 404 (403 degil): rotanin varligini bile dogrulamiyoruz. Kural (b) her
  // musteri domaininde gecerli — "burada boyle bir sey var ama yetkin yok"
  // demek, super admin yuzeyinin varligini her musteri domaininden
  // dogrulamak olurdu.
  return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });
}

/**
 * `/api/super-admin/*` rotalari icin: YALNIZ super admin host'undan ve
 * YALNIZ o origin'den kabul et.
 *
 * @returns Reddedildiyse dondurulecek cevap; kabul edildiyse `null`.
 *
 * Kullanim (her handler'in ilk iki satiri):
 *   const denied = requireSuperAdminHost(req);
 *   if (denied) return denied;
 */
export function requireSuperAdminHost(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host") || "";

  // (b) Baska host -> yok say.
  if (!isSuperAdminHost(host)) return notFound();

  // Origin kontrolu — ayni-site CSRF kapisi (gerekce: isSameHostOrigin).
  //
  // Origin YOKLUGU kabul edilir: tarayici disi cagrilar (curl, sunucudan
  // sunucuya) bu basligi gondermez ve onlarda CSRF diye bir sey yoktur —
  // kurbanin cerezi yok. Tarayicidan gelen her CROSS-ORIGIN istek ise
  // Origin tasir ve burada elenir.
  const origin = req.headers.get("origin");
  if (origin !== null && !isSameHostOrigin(origin, host)) {
    return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  }

  return null;
}

/**
 * Super admin host'u DISINDAKI API rotalari icin tersi: o host'tan gelen
 * istegi reddet.
 *
 * NEDEN (Deploy 1'de yorumla isaretlenmisti, Deploy 2'de kapatildi):
 * `/api/contact` super admin host'unda tenant'i "default"a dusuruyordu —
 * o host'a atilan bir iletisim formu DEFAULT kurumun kutusuna yaziyordu.
 * Asil sorun spam degil: kural (a)'nin butun anlami "bu host panelden
 * baska HICBIR SEY yapmaz". Anlamli cevap veren tek bir uc nokta bile
 * host'un VARLIGINI dogruluyor — joker DNS ve joker sertifika sayesinde
 * kazanilan obskuriteyi (host ne DNS'ten ne CT loglarindan sayilabiliyor)
 * bosa cikarirdi.
 */
export function rejectSuperAdminHost(req: NextRequest): NextResponse | null {
  return isSuperAdminHost(req.headers.get("host") || "") ? notFound() : null;
}
