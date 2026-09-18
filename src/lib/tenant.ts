import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { tenantTag } from "./tenant-cache";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  is_active: boolean;
  enabled_modules: Record<string, boolean>;
}

/**
 * Cache omru. `revalidateTag` ASIL koruma; bu yalnizca "tag atilamadi"
 * durumunun agi. Ayrinti: NOTE.md → "🔑 b3 UYGULAMASI".
 */
export const TENANT_CACHE_TTL_SECONDS = 60;

/**
 * OTURUMSUZ Supabase istemcisi — SADECE tenant lookup'i icin.
 *
 * 🔴 IKI SEBEPLE ZORUNLU, `lib/supabase/server.ts` BURADA KULLANILAMAZ:
 *
 * 1) `server.ts` `cookies()` cagiriyor; `unstable_cache` callback'i icinde
 *    `cookies()`/`headers()` cagirmak Next 14'te HATA verir.
 *
 * 2) Daha onemlisi DOGRULUK: cache SUNUCU GENELINDE paylasiliyor. Cerezle
 *    kurulmus (kullaniciya ozgu) bir istemcinin sonucunu cache'lemek, bir
 *    kullanicinin gordugunu herkese servis etmek demektir. Bu sorgu
 *    kullanicidan BAGIMSIZ olmali — oyle de: `tenants_public_select`
 *    policy'si `USING (true)`, yani satir herkese acik ve oturuma gore
 *    degismiyor (middleware de ayni sekilde anon key ile okuyor).
 *
 * ⚠️ Bu istemciye BASKA sorgu eklemeyin. Kullaniciya gore degisen bir sey
 * cache'lenirse sessiz bir capraz-kullanici sizintisi olur.
 */
function createTenantLookupClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * slug'dan tenant bilgisini getir — ISTEKLER ARASI cache'li (b3).
 *
 * ANAHTAR SLUG, HOST DEGIL. Bu bilincli: `www.` soyma ve custom_domain →
 * slug cevirimi cache'ten ONCE, `parseHostname` + middleware'de yapiliyor.
 * Iki sonucu var:
 *   - `kurmayteknoloji.com` ve `www.kurmayteknoloji.com` ayni anahtara duser
 *   - domain→slug eslemesi CACHE'LENMEZ; super admin bir custom_domain'i
 *     baska tenant'a tasirsa middleware bunu ANINDA gorur
 *
 * Gecersizlestirme: `revalidateTag(tenantTag(slug))` — super admin'in
 * toggle/update/delete uclarinda. TTL yalnizca yedek.
 */
export async function getTenant(slug: string): Promise<Tenant | null> {
  const tag = tenantTag(slug);
  // Gecersiz/bos slug: cache'lemeye deger degil, etiketi de olmaz.
  if (!tag) return null;

  const cached = unstable_cache(
    async () => {
      const supabase = createTenantLookupClient();
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      return (data as Tenant) ?? null;
    },
    ["tenant-by-slug", slug],
    { tags: [tag], revalidate: TENANT_CACHE_TTL_SECONDS }
  );

  return cached();
}
