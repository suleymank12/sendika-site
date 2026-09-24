import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmailsByIds } from "@/lib/supabase/admin-helpers";
import { requireSuperAdminHost } from "@/lib/super-admin/api-host-guard";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";

// GET ?tenantId=...
// Bir tenant'a bağlı kullanıcıları (email ile birlikte) döner.
export async function GET(req: NextRequest) {
  // Host kapisi — auth'tan ONCE (bkz. lib/super-admin/api-host-guard).
  const denied = requireSuperAdminHost(req);
  if (denied) return denied;

  // Ortak kapi (C8): rpc HATASI 503, gercek yetkisizlik 403, oturumsuz 401.
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

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

  // Her user_id için email'i auth.users'tan al.
  // Eskiden burada parametresiz `listUsers()` vardı: yalnızca İLK SAYFAYI
  // (varsayılan 50 kayıt) döndürür. Platformda 50'den fazla kullanıcı olunca
  // sonraki sayfalardaki adminler panelde "(e-posta yok)" görünüyordu.
  // Sayfalama artık getUserEmailsByIds'te — findUserByEmail ile aynı desen.
  const userIds = (links || []).map((l) => l.user_id);
  let emailMap: Map<string, string>;

  try {
    emailMap = await getUserEmailsByIds(admin, userIds);
  } catch (err) {
    // Fail-closed: e-postasız liste süper admin'i yanıltır (kimi sildiğini
    // göremez). Eksik veri göstermek yerine hatayı bildiriyoruz.
    console.error("[tenant-users:list] kullanıcı e-postaları alınamadı:", err);
    return NextResponse.json(
      { error: "Kullanıcı e-postaları alınamadı. Lütfen tekrar deneyin." },
      { status: 500 }
    );
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
