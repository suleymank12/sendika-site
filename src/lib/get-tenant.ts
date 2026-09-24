import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTenant } from "./tenant";
import type { Tenant } from "./tenant";
import { dogrula } from "./tenant-proof";
import { BILINMEYEN_ALAN_SLUG } from "./constants";
import { kisaHata } from "./supabase/zaman-asimli-fetch";

/**
 * Bu istegin kurumu — UC durum, ikisi birbirine KARISTIRILMAZ (K6, 21 Eylul 2026):
 *
 *   found        middleware slug yazdi, kurum var
 *   unknown-slug middleware slug yazdi, kurum YOK (bilinmeyen subdomain ya da
 *                B2 isareti: bilinmeyen ozel alan adi — DB'ye gidilmez)
 *   no-header    `x-tenant-slug` HIC YOK ya da kaniti (x-tenant-proof)
 *                DOGRULANMIYOR → bu istek middleware'den GECMEDI
 *
 * 🔴 NEDEN `no-header` AYRI: matcher `/api/`, `/_next/static/` ... yollarini
 * bilerek disarida tutuyor. Oralarda OLMAYAN bir yol istenince Next kendi
 * HTML 404'unu middleware'siz render ediyor; root layout metadata'si buraya
 * geliyor. Eskiden baslik yoksa slug "default" sayiliyordu → B'nin domaininde
 * A'nin kimligi (olculdu: `kurmayteknoloji.com/_next/static/yok.js` →
 * "Sendika Adı", og:site_name, logo). Baslik yoksa hangi host'un hangi
 * kuruma ait oldugunu BILMIYORUZ; tahmin etmek (default) hep yanlis tahmin —
 * apex disindaki her host'ta.
 *
 * Kim baslik gormeden cagiriyor (olculdu, 21 Eylul 2026, 184 istek): YALNIZ
 * root layout `generateMetadata`, YALNIZ matcher disi 404'te. Public sayfalar,
 * admin, robots, sitemap her zaman middleware'den geciyor (baslik var). Build
 * sirasinda `headers()` basligi okumadan firlatiyor (80 giris, 0 okuma) —
 * statik uretimde bu dala hic gelinmiyor. Rapor:
 * raporlar/2026-09-21-2050-k6-kimlik-sizintisi.md
 *
 * `x-tenant-slug`'i middleware HER calistiginda yazar (apex/custom domain icin
 * acikca "default") — yani apex'in default'u buradan degil middleware'den gelir.
 *
 * ✅ K7 KAPANDI (21 Eylul 2026): baslik VAR ama middleware calismadiysa —
 * yani istemci basligi KENDISI gonderdiyse — eskiden ayirt edilemiyordu.
 * Artik iki katman:
 *   (A) nginx /_next/static/'i diskten servis ediyor; olmayan dosya
 *       uygulamaya hic ulasmiyor (deploy/nginx/snippets/sendika-statik.conf).
 *   (B) middleware slug'in yanina `x-tenant-proof` (HMAC, lib/tenant-proof.ts)
 *       yaziyor; slug YALNIZ kanit bu host + slug icin DOGRULANIRSA okunuyor.
 *       Kanit yok / bos / yanlis → `no-header` (notr). "Kanit var mi"ya
 *       bakmak YETMEZ — degeri dogrulaniyor.
 * Onceki "canlida nginx siliyor" kaydi yanlisti: static location baslik
 * temizleyen parcayi include etmiyordu (raporlar/2026-09-21-2208-k7-teshis.md).
 *
 * `host` BURADA `headers().get("host")`: middleware'in slug'i cozdugu ham Host
 * basligiyla birebir ayni oldugu olculdu (x-forwarded-host dahil;
 * raporlar/2026-09-21-2250-k7-b-uygulama.md). Farkli olsaydi HMAC hic tutmaz,
 * sitenin tamami notr 404 olurdu. Host yoksa → `no-header`.
 *
 * 🔴 React `cache()` icinde (istek basina bir dogrulama); `unstable_cache`'e
 * ASLA girmez — orada `headers()` Next 14'te hata verir ve sonuc istekler
 * arasi paylasilirdi.
 */
export type TenantResolution =
  | { kind: "found"; tenant: Tenant }
  | { kind: "unknown-slug" }
  | { kind: "no-header" }
  /**
   * Kurum OKUNAMADI (veritabani hatasi / zaman asimi) — "yok" DEGIL (C2,
   * 24 Eylul 2026). Public: FIRLATILIR (notr hata sayfasi), ASLA notFound
   * ya da kurumsuz render. Admin: "Geçici Bir Sorun Oluştu" ekrani.
   */
  | { kind: "gecici-hata" };

export const resolveCurrentTenant = cache(async (): Promise<TenantResolution> => {
  const h = headers();
  const slug = h.get("x-tenant-slug");
  const host = h.get("host");
  if (!slug || !host) return { kind: "no-header" };
  if (!(await dogrula(host, slug, h.get("x-tenant-proof")))) return { kind: "no-header" };
  // B2: middleware'in "bu ozel alan adi hicbir kurumda yok" isareti — kurum
  // olmadigi KESIN, veritabanina sorgu gonderilmez (unstable_cache girdisi
  // de acilmaz). Kanit dogrulandiktan SONRA: imzasiz isaret no-header.
  if (slug === BILINMEYEN_ALAN_SLUG) return { kind: "unknown-slug" };
  let tenant: Tenant | null;
  try {
    tenant = await getTenant(slug);
  } catch (hata) {
    // Hata "bulunamadi" ile BIRLESTIRILMEZ (test:kurum-cozumu R5 muhurlu).
    console.error("[get-tenant] kurum okunamadi, gecici-hata:", kisaHata(hata));
    return { kind: "gecici-hata" };
  }
  return tenant ? { kind: "found", tenant } : { kind: "unknown-slug" };
});

/** Public tarafin gecici hatada firlattigi hata (notr hata sayfasina gider). */
export class KurumGeciciHatasi extends Error {
  constructor() {
    super("Kurum bilgisi gecici olarak okunamadi");
    this.name = "KurumGeciciHatasi";
  }
}

/**
 * Header'daki slug'i cozer — BULAMAZSA `null`, default'a DUSMEZ (b3 / Asama 0).
 * Baslik HIC yoksa da `null` (K6 — bkz. `resolveCurrentTenant`).
 *
 * NEDEN AYRI: `middleware.ts` fail-closed'i yalnizca **custom_domain**
 * dalinda uyguluyor; subdomain DB'ye sorulmadan kabul ediliyor
 * (`middleware.ts:92-94`). Dolayisiyla `olmayan-kurum.buyukdirilis.org.tr`
 * gibi bir host'ta slug cozulemez ve eski kod **sessizce default'a**
 * dusuyordu — NOTE.md'nin "zarar mekanizmasi" diye isaretledigi desenin ta
 * kendisi (8 Eylul bug'i).
 *
 * 🔴 Subdomain'i MIDDLEWARE'de dogrulamak DEGERLENDIRILDI ve ELENDI: orada
 * DB sorgusu gerekirdi, bu her subdomain istegine +117 ms ekler ve Edge
 * runtime'da `unstable_cache` calismadigi icin o maliyet ASLA geri alinamaz —
 * yani b3'un tum kazancini yerdi. Karar bu yuzden sayfa katmaninda: sorgu
 * zaten burada yapiliyor, cevap zaten elimizde. Bilgi neredeyse karar orada.
 */
export const getCurrentTenantOrNull = cache(async (): Promise<Tenant | null> => {
  const cozum = await resolveCurrentTenant();
  return cozum.kind === "found" ? cozum.tenant : null;
});

/**
 * Server Component'lerde kullan: const tenant = await getCurrentTenant();
 *
 * React cache() = ISTEK-ICI memoizasyon (generateMetadata + layout + page
 * ayni istekte 3-4 kez cagiriyor). `getTenant` ise ISTEKLER ARASI cache'li
 * (b3) — ikisi ayri katman.
 *
 * 🔴 KURUM YOKSA HICBIR KURUMA DUSMEZ — `notFound()`, notr 404:
 *   - `no-header` (K6): istek middleware'den gecmedi. Bugun bu dala giden
 *     production yolu YOK (olculdu); dal, K4 sinifi bir gerilemenin
 *     (matcher'dan bir public yolun dusmesi, Next 16'da prefetch'in
 *     middleware'i atlamasi — NOTE.md "Prefetch-matcher") SESSIZCE "B'nin
 *     domaininde A'nin sitesi"ne donusmesini engeller.
 *   - `unknown-slug` (K8, 22 Eylul 2026): kayitli olmayan subdomain
 *     (`olmayanbirad.<apex>`). ESKIDEN default kurumun TUM sitesini servis
 *     ediyordu (baslik "Site Bulunamadı" + noindex, ama govde, og:site_name,
 *     og:image — `metadataBase` yok diye `localhost`a cozulen — default'un;
 *     olculdu). Silinen ya da slug'i degisen bir kurumun eski adresi ve
 *     paylasilmis linkleri boylece sessizce baska bir kurumun sitesini
 *     gosteriyordu. Artik: sayfa, robots.txt, sitemap.xml notr 404; metadata
 *     root layout'un notr dalindan (hicbir kurumun adi/og'si/favicon'u yok).
 *
 * Bilinmeyen CUSTOM domain de bu dala gelir (B2, 23 Eylul 2026): middleware
 * onu cozemeyince BILINMEYEN_ALAN_SLUG isaretini yaziyor (eskiden "default" —
 * default kurumun sitesi yayinlaniyordu). Veritabani HATASI buraya gelmez:
 * middleware 503 donuyor (gecici, arama motoru sayfayi dusurmesin).
 *
 * 🔴 ADMIN TARAFI BUNU KULLANMAMALI. Orada yanlis panel acmaktansa hic
 * panel acmamak dogru — `getCurrentTenantOrNull()` + "Alan Adı Tanımlı Değil"
 * ekrani kullanilir (bkz. `admin/layout.tsx`); K8 admin'i DEGISTIRMEDI.
 */
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const cozum = await resolveCurrentTenant();
  if (cozum.kind === "found") return cozum.tenant;
  // Gecici hata "yok" DEGIL: notFound'a CEVRILMEZ (404 arama motorunda sayfayi
  // dusurur); firlatilir → notr hata sayfasi (C2/C7). notFound'dan ONCE olmali.
  if (cozum.kind === "gecici-hata") throw new KurumGeciciHatasi();
  // no-header ve unknown-slug: notr 404 (default'a dusus YOK)
  notFound();
});
