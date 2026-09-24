import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmailsByIds } from "@/lib/supabase/admin-helpers";
import { parseHostname } from "@/lib/tenant-hostname";
import { rejectSuperAdminHost } from "@/lib/super-admin/api-host-guard";

// Her istekte host + oturum okunur → statik degil.
export const dynamic = "force-dynamic";

/**
 * Kurum panelindeki "Panel Yoneticileri" ekranini besler (P2 — seffaflik,
 * 19 Eylul 2026).
 *
 * NEDEN API GEREKTI: e-postalar `auth.users`'ta ve o sema PostgREST'e
 * ACILMAMIS — tarayici oradan okuyamaz. Projede `auth.users` yalnizca
 * SERVICE ROLE ile okunuyor (bkz. lib/supabase/admin-helpers).
 *
 * 🔴 YETKILENDIRME RLS'E BIRAKILDI — elle uyelik kontrolu YOK.
 *   Liste, cagiranin KENDI oturumuyla okunuyor; migration 030'daki
 *   `tenant_users_same_tenant_select` politikasi kurum sinirini zaten
 *   uyguluyor. Uye olmayan 0 satir alir -> 403. Boylece:
 *     - tek sorgu eksilir (ayri bir "uye mi" kontrolu gerekmiyor),
 *     - ve asil sinir, elle yazilmis bir if degil, RLS olur (P1 dersi).
 *
 * VERI MINIMIZASYONU (KVKK md. 4): cevapta YALNIZ e-posta, eklenme tarihi
 * ve platform bayragi var. `user_id`, rol, son giris vb. DONDURULMEZ —
 * seffaflik icin gerekmiyorlar.
 */

/**
 * Host -> kurum. `/api` middleware matcher'inin DISINDA oldugu icin
 * x-tenant-slug header'i gelmez; cozum elle yapilir.
 *
 * KARDES: /api/contact icindeki `resolveTenantId`. Ayni mantik, iki fark:
 * orasi service role kullaniyor (oturumsuz public form), burasi cagiranin
 * OTURUMUNU kullaniyor — `tenants_public_select` (USING true) sayesinde
 * yeterli ve bir service-role cagrisi eksiliyor. Ucuncu bir cagiran
 * cikarsa ortak yardimciya tasinmali.
 */
async function resolveTenantId(
  supabase: ReturnType<typeof createClient>,
  host: string
): Promise<string | null> {
  const match = parseHostname(host);

  if (match.type === "custom_domain") {
    const { data } = await supabase
      .from("tenants")
      .select("id, is_active")
      .eq("custom_domain", match.host)
      .maybeSingle();
    if (!data || !data.is_active) return null;
    return data.id as string;
  }

  // super_admin host'u buraya HIC GELMEZ: asagidaki rejectSuperAdminHost
  // onu 404 ile eliyor.
  const slug = match.type === "subdomain" ? match.slug : "default";
  const { data } = await supabase
    .from("tenants")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data.id as string;
}

export async function GET(req: NextRequest) {
  // Host kapisi — super admin host'u bu ucu KULLANAMAZ (Deploy 2).
  const denied = rejectSuperAdminHost(req);
  if (denied) return denied;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  }

  const tenantId = await resolveTenantId(supabase, req.headers.get("host") || "");
  if (!tenantId) {
    return NextResponse.json({ error: "Geçersiz alan adı." }, { status: 404 });
  }

  // Cagiranin KENDI oturumu — RLS kurum sinirini uyguluyor.
  const { data: links, error } = await supabase
    .from("tenant_users")
    .select("user_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[panel-yoneticileri] tenant_users okunamadı:", error);
    return NextResponse.json({ error: "Liste okunamadı." }, { status: 500 });
  }

  // Bos liste = cagiran bu kurumun uyesi DEGIL. (Uye olsaydi en azindan
  // kendi satirini gorurdu — politikanin (1) dali.)
  if (!links || links.length === 0) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }

  const userIds = links.map((l) => l.user_id as string);
  const admin = createAdminClient("admin-okuma");

  // FAIL-CLOSED (tenant-users/list ile ayni karar): e-postasiz liste bu
  // ekrani anlamsiz kilar — eksik veri gostermek yerine hata bildirilir.
  let emailMap: Map<string, string>;
  try {
    emailMap = await getUserEmailsByIds(admin, userIds);
  } catch (err) {
    console.error("[panel-yoneticileri] e-postalar alınamadı:", err);
    return NextResponse.json(
      { error: "Yönetici bilgileri alınamadı. Lütfen tekrar deneyin." },
      { status: 500 }
    );
  }

  // Platform yoneticisi rozeti. `super_admins` tablosunun RLS'i acik ve
  // POLITIKASI YOK — yalniz service role okur, politikasi degismedi.
  //
  // 🔴 FAIL-CLOSED: bayrak okunamazsa liste rozetsiz gosterilmez. Rozetsiz
  // bir platform yoneticisi, kurum admininin gozunde SIRADAN bir yonetici
  // gibi durur — seffaflik ekraninin tam tersi. ("Asla sahte Tamam".)
  const { data: supers, error: superError } = await admin
    .from("super_admins")
    .select("user_id")
    .in("user_id", userIds);

  if (superError) {
    console.error("[panel-yoneticileri] super_admins okunamadı:", superError);
    return NextResponse.json(
      { error: "Yönetici bilgileri alınamadı. Lütfen tekrar deneyin." },
      { status: 500 }
    );
  }

  const platformIds = new Set((supers || []).map((s) => s.user_id as string));

  return NextResponse.json({
    yoneticiler: links.map((l) => ({
      email: emailMap.get(l.user_id as string) || "",
      eklendi: l.created_at as string,
      platform: platformIds.has(l.user_id as string),
    })),
  });
}
