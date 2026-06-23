import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tenant'in is_active durumunu degistirir (aktif/pasif toggle).
 *
 * Guvenlik katmanlari:
 *  1. requireSuperAdmin: sadece super admin'ler erisebilir
 *  2. Default tenant blanket guard: slug === "default" durumunda 403
 *     (UI'da disabled, delete-tenant ile simetri, savunma derinligi)
 *  3. Migration 014 trigger: DB seviyesinde son savunma (default'un
 *     pasiflenmesini engeller, service role ile bile bypass edilemez)
 *  4. RLS tenants_super_admin_update: yerinde kalir (olasi diger
 *     client yazimlari icin koruma)
 *
 * NOT: Tek atomik update — 207 (kismi basari) yok. 200 veya 4xx/5xx.
 * NOT: delete-tenant / tenant-users ile birebir tutarli — POST metod,
 * Turkce mesajlar, { data, error } pattern, requireSuperAdmin lokal
 * (is_super_admin RPC tabanli, diger super-admin route'lariyla ayni).
 */

// Super admin guard — delete-tenant + tenant-users pattern'i ile birebir
// ayni (is_super_admin RPC). Paylasilan export degil; her route kendi
// guard'ini tanimlar.
async function requireSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Yetkisiz erisim." }, { status: 401 }) };
  }
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });
  if (!isSuperAdmin) {
    return { error: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const body = await request.json().catch(() => null);
  const tenantId = body?.tenantId;
  const isActive = body?.isActive;

  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenantId zorunlu." }, { status: 400 });
  }

  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive (true/false) zorunlu." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1) Tenant fetch + default blanket guard
  const { data: tenant, error: tenantFetchError } = await admin
    .from("tenants")
    .select("id, slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantFetchError) {
    console.error("[toggle-tenant] tenant fetch hatasi:", tenantFetchError);
    return NextResponse.json({ error: "Tenant bilgisi alinamadi." }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json({ error: "Tenant bulunamadi." }, { status: 404 });
  }

  if (tenant.slug === "default") {
    return NextResponse.json(
      { error: "Varsayilan tenant'in durumu degistirilemez." },
      { status: 403 }
    );
  }

  // 2) Update — RLS bypass'lansa da migration 014 trigger'i default
  //    pasifleme denenirse RAISE EXCEPTION ile engeller (defansif derinlik).
  const { error: updateError } = await admin
    .from("tenants")
    .update({ is_active: isActive })
    .eq("id", tenantId);

  if (updateError) {
    console.error("[toggle-tenant] update hatasi:", updateError);
    // Trigger exception veya diger DB hatasi — trigger 014 zaten Turkce
    // mesaj firlatir, kullaniciya gosterilebilir.
    return NextResponse.json(
      { error: updateError.message || "Durum guncellenemedi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, tenantId, isActive }, { status: 200 });
}
