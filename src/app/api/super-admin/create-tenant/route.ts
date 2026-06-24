import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUserByEmail } from "@/lib/supabase/admin-helpers";
import { RESERVED_TENANT_SLUGS } from "@/lib/constants";

interface RequestBody {
  name: string;
  slug: string;
  adminEmail: string;
  customDomain?: string;
  enabledModules?: {
    donations?: boolean;
    membership?: boolean;
  };
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function POST(req: NextRequest) {
  // 1) Auth — gelen istekteki kullanıcıyı al
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  }

  // 2) Süper admin kontrolü
  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });

  if (rpcError || !isSuperAdmin) {
    return NextResponse.json(
      { error: "Bu işlem için yetkiniz yok." },
      { status: 403 }
    );
  }

  // 3) Body validation
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const slug = (body.slug || "").trim().toLowerCase();
  const adminEmail = (body.adminEmail || "").trim().toLowerCase();
  const customDomain = (body.customDomain || "").trim().toLowerCase() || null;
  const enabledModules = {
    donations: !!body.enabledModules?.donations,
    membership: !!body.enabledModules?.membership,
  };

  if (!name) {
    return NextResponse.json({ error: "Kuruluş adı zorunludur." }, { status: 400 });
  }
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Geçersiz subdomain. Sadece küçük harf, rakam ve tire kullanın." },
      { status: 400 }
    );
  }
  if ((RESERVED_TENANT_SLUGS as readonly string[]).includes(slug)) {
    return NextResponse.json(
      { error: `"${slug}" rezerve bir slug, kullanılamaz.` },
      { status: 400 }
    );
  }
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return NextResponse.json(
      { error: "Geçerli bir admin e-postası girin." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 4) Slug çakışma kontrolü
  const { data: existing } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Bu subdomain zaten kullanılıyor." },
      { status: 409 }
    );
  }

  // 5) Tenant oluştur
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name,
      slug,
      custom_domain: customDomain,
      enabled_modules: enabledModules,
      is_active: true,
    })
    .select("*")
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json(
      { error: "Tenant oluşturulamadı: " + (tenantError?.message || "bilinmeyen hata") },
      { status: 500 }
    );
  }

  const tenantId = tenant.id as string;

  // 6) Varsayılan site_settings
  const defaultSettings: Array<{ key: string; value: string }> = [
    { key: "site_title", value: name },
    { key: "site_description", value: `${name} Kurumsal Web Sitesi` },
    { key: "navbar_color", value: "#1B3A5C" },
    { key: "layout_type", value: "layout1" },
    { key: "contact_phone", value: "" },
    { key: "contact_email", value: adminEmail },
    { key: "contact_address", value: "" },
    { key: "footer_text", value: `© ${new Date().getFullYear()} ${name}. Tüm hakları saklıdır.` },
    { key: "footer_credit_enabled", value: "true" },
    { key: "logo_url", value: "/placeholder-logo.png" },
  ];

  await admin
    .from("site_settings")
    .insert(defaultSettings.map((s) => ({ ...s, tenant_id: tenantId })));

  // 7) Varsayılan menü öğeleri
  const defaultMenu: Array<{ title: string; url: string; order: number }> = [
    { title: "Anasayfa", url: "/", order: 1 },
    { title: "Haberler", url: "/haberler", order: 2 },
    { title: "Duyurular", url: "/duyurular", order: 3 },
    { title: "Galeri", url: "/galeri", order: 4 },
    { title: "İletişim", url: "/iletisim", order: 5 },
  ];

  await admin.from("menu_items").insert(
    defaultMenu.map((m) => ({
      ...m,
      tenant_id: tenantId,
      is_active: true,
    }))
  );

  // 8) Admin kullanıcıyı bul veya oluştur
  const existingUser = await findUserByEmail(admin, adminEmail);
  let adminUserId: string | null = existingUser?.id ?? null;

  if (!adminUserId) {
    // Kullanıcı yok — oluştur (davet maili ile)
    const inviteRedirectUrl =
      process.env.NODE_ENV === "production"
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/davet-kabul`
        : `http://${slug}.lvh.me:3000/admin/davet-kabul`;

    const { data: created, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(adminEmail, {
        redirectTo: inviteRedirectUrl,
      });
    if (inviteError || !created?.user) {
      console.error("[CreateTenant] inviteUserByEmail hatası:", inviteError);
      return NextResponse.json(
        {
          error:
            "Tenant oluşturuldu fakat admin kullanıcı davet edilemedi: " +
            (inviteError?.message || "bilinmeyen hata"),
          tenant,
        },
        { status: 207 } // Multi-Status — kısmi başarı
      );
    }
    adminUserId = created.user.id;
  }

  // 9) tenant_users'a admin olarak ekle
  const { error: linkError } = await admin
    .from("tenant_users")
    .insert({
      tenant_id: tenantId,
      user_id: adminUserId,
      role: "admin",
    });

  if (linkError) {
    // tenant_users kaydı yapılamadı ama tenant ve diğer veriler kuruldu — UI'a bildir
    return NextResponse.json(
      {
        error:
          "Tenant oluşturuldu fakat admin kullanıcı bağlanamadı: " + linkError.message,
        tenant,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({ success: true, tenant }, { status: 201 });
}
