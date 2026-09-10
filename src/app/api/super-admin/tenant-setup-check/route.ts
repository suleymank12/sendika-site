import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRootDomain } from "@/lib/tenant-hostname";
import { isUuid } from "@/lib/super-admin/orphan-users";
import { runSetupProbes } from "@/lib/super-admin/setup-probes";
import { createNodeProbeDeps } from "@/lib/super-admin/setup-probe-deps";
import type { SetupAdmin, SetupSnapshot } from "@/lib/super-admin/setup-checklist";

// Durum her açılışta CANLI ölçülür — önbellekten eski sonuç, düzeltilmiş bir
// adımı hâlâ "Eksik" (ya da tersi) gösterir.
export const dynamic = "force-dynamic";

/**
 * Kurulum Durumu verisi — tenants/[id] sayfasındaki SetupChecklist çağırır.
 *
 *  GET ?tenantId=…          → DB/Auth anlık durumu ({ snapshot }) — hızlı
 *  GET ?tenantId=…&probe=1  → canlı yoklamalar ({ probes }): DNS, sertifika,
 *                             Nginx, Supabase Redirect URLs (≈ 5 sn üst sınır)
 *
 * Route yalnız HAM veriyi döndürür; durum hesabı saf modülde
 * (lib/super-admin/setup-checklist → evaluateSetup) ve test edilir.
 * Yoklanan host'lar YALNIZ DB'den gelir — istemci host veremez (SSRF, bkz.
 * lib/super-admin/setup-probes).
 */

// Super admin guard — tenant-users / orphan-users ile aynı sözleşme
// ({ error } | { user }); her route kendi guard'ını tanımlıyor.
async function requireSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 }) };
  }
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });
  if (!isSuperAdmin) {
    return { error: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }) };
  }
  return { user };
}

/** Kurum admininin işleri için okunan ayarlar. */
const SETTING_KEYS = ["logo_url", "contact_phone", "contact_address"];

/** Adminler + Auth durumu. Herhangi bir okuma hatası → null (Belirlenemedi). */
async function readAdmins(
  admin: SupabaseClient,
  tenantId: string
): Promise<SetupAdmin[] | null> {
  const { data, error } = await admin
    .from("tenant_users")
    .select("user_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error || !data) {
    console.error("[tenant-setup-check] tenant_users okunamadı:", error);
    return null;
  }
  try {
    // Kurum başına birkaç admin — kişi başına getUserById yeterli.
    return await Promise.all(
      data.map(async (row: { user_id: string }) => {
        const { data: u, error: userError } = await admin.auth.admin.getUserById(row.user_id);
        if (userError || !u?.user) throw userError ?? new Error("kullanıcı bulunamadı");
        return {
          email: u.user.email ?? "",
          invitedAt: u.user.invited_at ?? null,
          lastSignInAt: u.user.last_sign_in_at ?? null,
        };
      })
    );
  } catch (err) {
    console.error("[tenant-setup-check] Auth kullanıcısı okunamadı:", err);
    return null;
  }
}

async function readSettings(
  admin: SupabaseClient,
  tenantId: string
): Promise<Record<string, string | null> | null> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", SETTING_KEYS);
  if (error || !data) {
    console.error("[tenant-setup-check] site_settings okunamadı:", error);
    return null;
  }
  return Object.fromEntries(
    data.map((r: { key: string; value: string | null }) => [r.key, r.value])
  );
}

async function countRows(
  admin: SupabaseClient,
  table: "news_categories" | "menu_items" | "homepage_sections",
  tenantId: string
): Promise<number | null> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`[tenant-setup-check] ${table} sayılamadı:`, error);
    return null;
  }
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!isUuid(tenantId)) {
    return NextResponse.json({ error: "Geçersiz kurum." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, slug, name, custom_domain, is_active")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) {
    console.error("[tenant-setup-check] tenant okunamadı:", tenantError);
    return NextResponse.json({ error: "Kurum okunamadı." }, { status: 500 });
  }
  if (!tenant) {
    return NextResponse.json({ error: "Kurum bulunamadı." }, { status: 404 });
  }

  const rootDomain = getRootDomain();

  if (req.nextUrl.searchParams.get("probe") === "1") {
    // runSetupProbes fırlatmaz: her yoklama kendi sonucunu / hata kodunu taşır.
    const probes = await runSetupProbes(
      {
        slug: tenant.slug,
        rootDomain,
        customDomain: tenant.custom_domain,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      },
      createNodeProbeDeps()
    );
    return NextResponse.json({ probes });
  }

  const [admins, settings, categories, menuItems, homepageSections] = await Promise.all([
    readAdmins(admin, tenantId),
    readSettings(admin, tenantId),
    countRows(admin, "news_categories", tenantId),
    countRows(admin, "menu_items", tenantId),
    countRows(admin, "homepage_sections", tenantId),
  ]);

  const snapshot: SetupSnapshot = {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      customDomain: tenant.custom_domain,
      isActive: tenant.is_active,
    },
    rootDomain,
    admins,
    settings,
    counts: { categories, menuItems, homepageSections },
  };
  return NextResponse.json({ snapshot });
}
