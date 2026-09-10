import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanupOrphanUserIfNeeded,
  type CleanupResult,
} from "@/lib/super-admin/cleanup-orphan-user";
import { getUserEmailsByIds } from "@/lib/supabase/admin-helpers";
import {
  purgeTenantStorage,
  ROUTE_STORAGE_BUDGET_MS,
} from "@/lib/super-admin/tenant-storage-purge.mjs";

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
 *  6. Storage: {tenant_id}/ klasorunu temizle — kurum DB'den silindikten
 *     SONRA, en iyi cabayla, 20 sn sure butceli (tenant-storage-purge.mjs;
 *     guard'lar orada). Basarisizlikta kurum silinmis kalir.
 *  7. Sonuc raporu: 200 (tam) / 207 (kismi — hesap reason="error" ya da
 *     storage eksik) / 4xx-5xx (tenant silinemedi)
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

  // 5) Storage: kurum DB'den silindi → {tenant_id}/ klasorunu temizle. En iyi
  //    caba ve sure butceli (nginx 60 sn). Guard'lar ortak modulde: kurum
  //    tenants'ta hala varsa, varsayilan kurumsa ya da yol baska kuruma
  //    aitse HICBIR SEY silinmez. Basarisizlikta kurum silinmis kalir (asil
  //    is + erisimin kapanmasi); kalan dosyalar 207 ile bildirilir,
  //    scripts/sweep-orphan-storage.mjs sonra temizler.
  const storage = await purgeTenantStorage(admin, tenantId, {
    budgetMs: ROUTE_STORAGE_BUDGET_MS,
  });
  if (storage.status !== "done") {
    console.error("[delete-tenant] storage temizligi eksik:", storage);
  }

  // 6) Sonuc raporu — 207'yi iki sey tetikler: hesap temizliginde
  //    reason="error" (multi-tenant / super-admin korumalari BASARI sayilir)
  //    ya da storage temizliginin eksik kalmasi.
  const errored = userDeleteResults.filter(
    (r) => !r.result.deleted && r.result.reason === "error"
  );
  const deletedUsers = userDeleteResults
    .filter((r) => r.result.deleted)
    .map((r) => r.userId);

  if (errored.length === 0 && storage.status === "done") {
    return NextResponse.json(
      {
        ok: true,
        deletedTenantId: tenantId,
        deletedUsers,
        storage,
      },
      { status: 200 }
    );
  }

  // Tenant gitti ama hesap ve/veya storage temizligi eksik — 207 Multi-Status.
  // Panel uyarisi KIMIN kaldigini gostersin diye e-postalar eklenir (hesaplar
  // silinemedigi icin Auth'ta hala duruyorlar). E-posta alinamazsa ID ile
  // devam — uyari yine gosterilir, kisi Baglantisiz Hesaplar listesinde.
  let failedEmails = new Map<string, string>();
  if (errored.length > 0) {
    try {
      failedEmails = await getUserEmailsByIds(
        admin,
        errored.map((r) => r.userId)
      );
    } catch (err) {
      console.error("[delete-tenant] temizlenemeyen hesaplarin e-postasi alinamadi:", err);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      partial: true,
      deletedTenantId: tenantId,
      deletedUsers,
      failedUsers: errored.map((r) => ({
        userId: r.userId,
        email: failedEmails.get(r.userId) ?? null,
        error:
          !r.result.deleted && r.result.reason === "error"
            ? r.result.error
            : undefined,
      })),
      storage,
      message:
        "Tenant silindi ancak temizlik tamamlanamadi (kullanici hesaplari ve/veya dosyalar).",
    },
    { status: 207 }
  );
}
