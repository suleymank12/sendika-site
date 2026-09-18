import { cache } from "react";
import { headers } from "next/headers";
import { getTenant } from "./tenant";
import type { Tenant } from "./tenant";

/**
 * Header'daki slug'i cozer — BULAMAZSA `null`, default'a DUSMEZ (b3 / Asama 0).
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
  const headersList = headers();
  const slug = headersList.get("x-tenant-slug") || "default";
  return getTenant(slug);
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
 */
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const tenant = await getCurrentTenantOrNull();
  if (tenant) return tenant;

  const defaultTenant = await getTenant("default");
  if (!defaultTenant) {
    throw new Error("Default tenant bulunamadı!");
  }
  return defaultTenant;
});
