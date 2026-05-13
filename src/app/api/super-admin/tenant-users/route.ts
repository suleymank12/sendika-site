import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUserByEmail } from "@/lib/supabase/admin-helpers";

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
    return {
      error: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
    };
  }
  return { user };
}

// POST: tenant'a admin ekle (e-posta ile bul/invite et + tenant_users insert)
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  let body: { tenantId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const tenantId = (body.tenantId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const role = (body.role || "admin").trim();

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId zorunlu." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Tenant gerçekten var mı?
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    return NextResponse.json({ error: "Tenant bulunamadı." }, { status: 404 });
  }

  // Kullanıcıyı bul, yoksa davet et
  const existingUser = await findUserByEmail(admin, email);
  let userId: string | null = existingUser?.id ?? null;

  if (!userId) {
    const inviteRedirectUrl =
      process.env.NODE_ENV === "production"
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/davet-kabul`
        : `http://${tenant.slug}.lvh.me:3000/admin/davet-kabul`;

    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteRedirectUrl,
      });
    if (inviteError || !invited?.user) {
      console.error("[TenantUsers] inviteUserByEmail hatası:", inviteError);
      return NextResponse.json(
        { error: "Kullanıcı davet edilemedi: " + (inviteError?.message || "") },
        { status: 500 }
      );
    }
    userId = invited.user.id;
  }

  // tenant_users insert (UNIQUE çakışmada hata döndür)
  const { data: link, error: linkError } = await admin
    .from("tenant_users")
    .insert({ tenant_id: tenantId, user_id: userId, role })
    .select("*")
    .single();

  if (linkError) {
    if ((linkError as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Bu kullanıcı zaten bu tenant'ın admini." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Bağlantı kurulamadı: " + linkError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, link }, { status: 201 });
}

// DELETE: tenant_users kaydını sil
export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id parametresi gerekli." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tenant_users").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
