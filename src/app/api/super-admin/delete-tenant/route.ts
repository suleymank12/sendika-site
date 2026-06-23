import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanupOrphanUserIfNeeded,
  type CleanupResult,
} from "@/lib/super-admin/cleanup-orphan-user";

/**
 * Bir tenant'i tum bagimliliklariyla siler ve YALNIZCA bu tenant'a bagli
 * (super admin olmayan) auth.users kayitlarini temizler.
 *
 * Akis (cascade-after):
 *  1. Guard: super admin authentication
 *  2. Guard: default tenant silinemez (UI guard'i var, server'da da zorla)
 *  3. Bu tenant'in tum tenant_users.user_id'lerini al (silmeden ONCE topla)
 *  4. Tenant'i sil (cascade: tenant_users + tum tenant icerik tablolari)
 *  5. Her uye icin cleanupOrphanUserIfNeeded cagir. Cascade tenant_users'i
 *     sildigi icin excludeTenantId VERILMEZ — helper'in saf count'u
 *     sole-tenant'i dogru tespit eder (multi-tenant'lar korunur, super
 *     admin korunur).
 *  6. Sonuc raporu: 200 (tam) / 207 (kismi — reason="error") /
 *     4xx-5xx (tenant silinemedi)
 *
 * NOT: Postgres + Auth arasinda transaction YOK. Tenant silmek asil hedef
 * oldugu icin ONCE tenant siliniyor (cascade), SONRA auth temizligi. Tersi
 * sira (once user) daha riskli — tenant silme patlarsa user'lar gitmis ama
 * tenant durmus olurdu.
 *
 * Sole-tenant / super-admin / multi-tenant karari ve auth.users silme
 * mantigi cleanupOrphanUserIfNeeded helper'inda (tenant-users DELETE ile
 * paylasiliyor).
 */

// Super admin guard — mevcut tenant-users/route.ts pattern'i ile ayni.
// (requireSuperAdmin paylasilan bir export DEGIL; her route kendi guard'ini
//  tanimliyor. Ayni sozlesmeyi koruyoruz: { error } | { user }.)
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
  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenantId zorunlu" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) Tenant kaydini cek + default kontrol
  const { data: tenant, error: tenantFetchError } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantFetchError) {
    console.error("[delete-tenant] tenant fetch hatasi:", tenantFetchError);
    return NextResponse.json({ error: "Tenant bilgisi alinamadi" }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json({ error: "Tenant bulunamadi" }, { status: 404 });
  }

  if (tenant.slug === "default") {
    return NextResponse.json({ error: "Varsayilan tenant silinemez" }, { status: 403 });
  }

  // 2) Bu tenant'in tum kullanici uyeliklerini al
  const { data: memberships, error: membershipsError } = await admin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId);

  if (membershipsError) {
    console.error("[delete-tenant] tenant_users fetch hatasi:", membershipsError);
    return NextResponse.json(
      { error: "Kullanici uyelikleri alinamadi" },
      { status: 500 }
    );
  }

  const memberUserIds = (memberships || [])
    .map((m) => m.user_id)
    .filter(Boolean) as string[];

  // 3) Tenant'i sil (cascade: icerik tablolari + tenant_users)
  const { error: deleteTenantError } = await admin
    .from("tenants")
    .delete()
    .eq("id", tenantId);

  if (deleteTenantError) {
    console.error("[delete-tenant] tenant silme hatasi:", deleteTenantError);
    return NextResponse.json(
      {
        error:
          "Tenant silinemedi. Ona bagli icerikler veya baska bir kisit olabilir.",
      },
      { status: 500 }
    );
  }

  // 4) Cascade-after: her uye icin helper cagir (excludeTenantId omit —
  //    cascade tenant_users satirlarini zaten sildi, saf count yeterli).
  const userDeleteResults: { userId: string; result: CleanupResult }[] = [];

  for (const userId of memberUserIds) {
    const result = await cleanupOrphanUserIfNeeded(admin, userId);
    userDeleteResults.push({ userId, result });
  }

  // 5) Sonuc raporu — yalniz reason="error" durumu 207 tetikler.
  //    (multi-tenant / super-admin korumalari BASARI sayilir.)
  const errored = userDeleteResults.filter(
    (r) => !r.result.deleted && r.result.reason === "error"
  );
  const deletedUsers = userDeleteResults
    .filter((r) => r.result.deleted)
    .map((r) => r.userId);

  if (errored.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        deletedTenantId: tenantId,
        deletedUsers,
      },
      { status: 200 }
    );
  }

  // Tenant gitti ama bazi user temizlemeleri patladi — 207 Multi-Status
  return NextResponse.json(
    {
      ok: true,
      partial: true,
      deletedTenantId: tenantId,
      deletedUsers,
      failedUsers: errored.map((r) => ({
        userId: r.userId,
        error:
          !r.result.deleted && r.result.reason === "error"
            ? r.result.error
            : undefined,
      })),
      message: "Tenant silindi ancak bazi kullanici hesaplari temizlenemedi.",
    },
    { status: 207 }
  );
}
