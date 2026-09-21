import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTenant } from "./tenant";
import type { Tenant } from "./tenant";
import { dogrula } from "./tenant-proof";

/**
 * Bu istegin kurumu — UC durum, ikisi birbirine KARISTIRILMAZ (K6, 21 Eylul 2026):
 *
 *   found        middleware slug yazdi, kurum var
 *   unknown-slug middleware slug yazdi, kurum YOK (bilinmeyen subdomain)
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
  | { kind: "no-header" };

export const resolveCurrentTenant = cache(async (): Promise<TenantResolution> => {
  const h = headers();
  const slug = h.get("x-tenant-slug");
  const host = h.get("host");
  if (!slug || !host) return { kind: "no-header" };
  if (!(await dogrula(host, slug, h.get("x-tenant-proof")))) return { kind: "no-header" };
  const tenant = await getTenant(slug);
  return tenant ? { kind: "found", tenant } : { kind: "unknown-slug" };
});

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
 * ⚠️ Slug cozulemezse **default tenant'a duser**. Bu, public taraf icin
 * BELGELI ve KASITLI bir karardir (`middleware.ts` fail-closed bolumu:
 * "Public tarafta mevcut davranis KORUNUR … ziyaretci default siteyi gorur,
 * salt okuma, zarar yok, site tamamen kapanmaz"). Yanlis yazilmis bir
 * subdomain yuzunden calisan bir siteyi 404'e dusurmek orantisiz olurdu.
 *
 * 🔴 ADMIN TARAFI BUNU KULLANMAMALI. Orada yanlis panel acmaktansa hic
 * panel acmamak dogru — `getCurrentTenantOrNull()` + `/admin/tenant-bulunamadi`
 * kullanilir (bkz. `admin/(authenticated)/layout.tsx`).
 *
 * 🔴 Baslik HIC YOKSA default'a DUSMEZ — `notFound()` (K6). Bugun bu dala
 * giden production yolu YOK (olculdu); dal, K4 sinifi bir gerilemenin
 * (matcher'dan bir public yolun dusmesi, Next 16'da prefetch'in middleware'i
 * atlamasi — NOTE.md "Prefetch-matcher") SESSIZCE "B'nin domaininde A'nin
 * sitesi"ne donusmesini engeller: gerileme yerine her host'ta notr 404
 * gorunur, duman testinde ve izolasyon matrisinde hemen yakalanir.
 */
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const cozum = await resolveCurrentTenant();
  if (cozum.kind === "found") return cozum.tenant;
  if (cozum.kind === "no-header") notFound();

  const defaultTenant = await getTenant("default");
  if (!defaultTenant) {
    throw new Error("Default tenant bulunamadı!");
  }
  return defaultTenant;
});
