import { notFound, permanentRedirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getPageBySlug } from "@/lib/public-queries";
import { ESKI_KURUMSAL_ADRESLER } from "@/lib/constants";

interface Props {
  params: { slug: string };
}

/**
 * ESKI ADRES UYUMLULUGU — /kurumsal/hakkimizda | tuzuk | misyon-vizyon
 * (23 Eylul 2026). Sayfalar artik yalniz /sayfa/<slug>'da; bu rota eski
 * adresleri oraya tasir. Gerekce ve listenin anlami: lib/constants.ts
 * ESKI_KURUMSAL_ADRESLER.
 *
 * Sira bilincli:
 *  1. Kurum ONCE cozulur. Bilinmeyen host'ta getCurrentTenant notFound()
 *     atar → K8'in notr 404'u aynen (yonlendirme kurumdan bagimsiz
 *     next.config redirects'te olsaydi bilinmeyen host da 308 alirdi).
 *  2. Listede olmayan her /kurumsal/<x> → 404 (eskisi gibi).
 *  3. O kurumun bu kisa adla YAYINDA sayfasi varsa 308, yoksa 404 —
 *     sayfasi olmayan kurumda "yonlendirme → 404" zinciri olusmaz.
 *
 * permanentRedirect App Router'da 308 uretir (sayfa icinden 301 yok);
 * arama motorlari 308'i 301 gibi kalici sayar.
 *
 * /kurumsal/yonetim-kurulu statik rota; Next statik bolumu dinamikten
 * once esler, bu dosya ona hic ulasmaz.
 */
export default async function EskiKurumsalAdres({ params }: Props) {
  const tenant = await getCurrentTenant();
  if (!(ESKI_KURUMSAL_ADRESLER as readonly string[]).includes(params.slug)) notFound();
  const page = await getPageBySlug(tenant.id, params.slug);
  if (!page) notFound();
  permanentRedirect(`/sayfa/${params.slug}`);
}
