import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET ?tenantId=...
// Bir tenant'a bağlı kullanıcıları (email ile birlikte) döner.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
  }
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId gerekli." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: links, error } = await admin
    .from("tenant_users")
    .select("id, user_id, role, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Her user_id için email'i auth.users'tan al
  const userIds = (links || []).map((l) => l.user_id);
  const emailMap = new Map<string, string>();

  if (userIds.length > 0) {
    // admin.listUsers — küçük platformlar için yeterli, pagination yok
    const { data: usersList } = await admin.auth.admin.listUsers();
    (usersList?.users || []).forEach((u) => {
      if (userIds.includes(u.id)) emailMap.set(u.id, u.email || "");
    });
  }

  const result = (links || []).map((l) => ({
    id: l.id,
    user_id: l.user_id,
    email: emailMap.get(l.user_id) || "",
    role: l.role,
    created_at: l.created_at,
  }));

  return NextResponse.json({ users: result });
}
