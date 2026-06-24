import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESERVED_TENANT_SLUGS,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  CUSTOM_DOMAIN_REGEX,
} from "@/lib/constants";

/**
 * Tenant alanlarini gunceller (name, slug, custom_domain, is_active, enabled_modules).
 *
 * Guvenlik katmanlari:
 *  1. requireSuperAdmin: sadece super admin'ler erisebilir
 *  2. Default tenant koruma:
 *     - Slug "default"tan degistirilmeye calisilirsa 403
 *       (KRITIK: 014 trigger SADECE is_active'i koruyor, slug degisimi DB'de
 *        bos — bu endpoint TEK savunma hatti)
 *     - is_active=false denenirse 403 (014 trigger ile redundancy, Sprint 3.8 simetri)
 *  3. Slug validation:
 *     - Format (SLUG_REGEX)
 *     - Uzunluk SLUG_MIN_LENGTH..SLUG_MAX_LENGTH
 *     - Rezerve liste (RESERVED_TENANT_SLUGS) — client guard'i atlanabilir
 *  4. Custom domain validation:
 *     - Bos kabul edilir (null)
 *     - Format (CUSTOM_DOMAIN_REGEX)
 *     - Uniqueness pre-check (daha temiz 409 mesaji)
 *  5. Slug uniqueness pre-check (degisirse)
 *  6. Modules normalize: bilinmeyen key'ler atilir, boolean zorlanir
 *  7. updated_at server-set (client saatine guvenme)
 *  8. 23505 fallback (race condition icin son savunma)
 *
 * NOT: Trigger 014 ve RLS tenants_super_admin_update yerinde kalir
 * (savunma derinligi, Sprint 3.8 pattern'i).
 */

// Super admin guard — mevcut delete-tenant/tenant-users/toggle-tenant pattern'i ile ayni
async function requireSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Yetkisiz erisim." }, { status: 401 }),
    };
  }

  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });

  if (!isSuperAdmin) {
    return {
      error: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
    };
  }

  return { user };
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const body = await request.json().catch(() => null);
  const tenantId = body?.tenantId;
  const name = body?.name;
  const slug = body?.slug;
  const customDomain = body?.customDomain; // null veya string
  const isActive = body?.isActive;
  const enabledModules = body?.enabledModules;

  // Body type validation
  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenantId zorunlu." }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "İsim zorunlu." }, { status: 400 });
  }
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Slug zorunlu." }, { status: 400 });
  }
  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive (true/false) zorunlu." },
      { status: 400 }
    );
  }

  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedName = name.trim();
  const normalizedCustomDomain =
    customDomain && typeof customDomain === "string"
      ? customDomain.trim().toLowerCase() || null
      : null;

  // Slug format + uzunluk
  if (
    normalizedSlug.length < SLUG_MIN_LENGTH ||
    normalizedSlug.length > SLUG_MAX_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Slug ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} karakter olmalı.`,
      },
      { status: 400 }
    );
  }
  if (!SLUG_REGEX.test(normalizedSlug)) {
    return NextResponse.json(
      {
        error:
          "Slug yalnızca küçük harf, rakam ve tire içerebilir (başta/sonda tire olamaz).",
      },
      { status: 400 }
    );
  }

  // Custom domain format (boş değilse)
  if (
    normalizedCustomDomain &&
    !CUSTOM_DOMAIN_REGEX.test(normalizedCustomDomain)
  ) {
    return NextResponse.json(
      {
        error:
          "Custom domain geçerli bir hostname olmalı (protokol/path olmadan, en az bir nokta).",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1) Mevcut tenant fetch
  const { data: existing, error: fetchError } = await admin
    .from("tenants")
    .select("id, slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (fetchError) {
    console.error("[update-tenant] tenant fetch hatasi:", fetchError);
    return NextResponse.json(
      { error: "Tenant bilgisi alinamadi." },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Tenant bulunamadi." }, { status: 404 });
  }

  // 2) Default tenant koruma
  if (existing.slug === "default") {
    if (normalizedSlug !== "default") {
      return NextResponse.json(
        { error: "Varsayilan tenant'in slug'i degistirilemez." },
        { status: 403 }
      );
    }
    if (isActive === false) {
      return NextResponse.json(
        { error: "Varsayilan tenant pasiflenemez (sistem icin gerekli)." },
        { status: 403 }
      );
    }
  }

  // 3) Rezerve slug kontrolu (default DISINDA — default kendi adina sahip kalabilir)
  if (
    existing.slug !== "default" &&
    (RESERVED_TENANT_SLUGS as readonly string[]).includes(normalizedSlug)
  ) {
    return NextResponse.json(
      { error: `"${normalizedSlug}" rezerve bir slug, kullanılamaz.` },
      { status: 400 }
    );
  }

  // 4) Slug uniqueness pre-check (degistirse)
  if (normalizedSlug !== existing.slug) {
    const { data: slugClash } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", normalizedSlug)
      .neq("id", tenantId)
      .maybeSingle();

    if (slugClash) {
      return NextResponse.json(
        {
          error: `"${normalizedSlug}" slug'i baska bir tenant tarafindan kullaniliyor.`,
        },
        { status: 409 }
      );
    }
  }

  // 5) Custom domain uniqueness pre-check (varsa)
  if (normalizedCustomDomain) {
    const { data: domainClash } = await admin
      .from("tenants")
      .select("id")
      .eq("custom_domain", normalizedCustomDomain)
      .neq("id", tenantId)
      .maybeSingle();

    if (domainClash) {
      return NextResponse.json(
        {
          error: `"${normalizedCustomDomain}" baska bir tenant tarafindan kullaniliyor.`,
        },
        { status: 409 }
      );
    }
  }

  // 6) Modules normalize — bilinmeyen key'leri at, boolean'a zorla
  const normalizedModules = {
    donations: !!enabledModules?.donations,
    membership: !!enabledModules?.membership,
  };

  // 7) Update
  const { error: updateError } = await admin
    .from("tenants")
    .update({
      name: normalizedName,
      slug: normalizedSlug,
      custom_domain: normalizedCustomDomain,
      is_active: isActive,
      enabled_modules: normalizedModules,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (updateError) {
    console.error("[update-tenant] update hatasi:", updateError);

    // 23505 unique violation — son savunma (pre-check race condition)
    if (updateError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Slug veya custom_domain başka bir tenant tarafından kullanılıyor.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: updateError.message || "Guncelleme basarisiz oldu." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      tenantId,
      slug: normalizedSlug,
    },
    { status: 200 }
  );
}
