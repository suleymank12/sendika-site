import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupOrphanUserIfNeeded } from "@/lib/super-admin/cleanup-orphan-user";
import { isUuid, listOrphanUsers } from "@/lib/super-admin/orphan-users";

// Liste her istekte canlı okunmalı (önbellekten eski liste silme kararını
// yanıltır). cookies() zaten dinamik yapıyor; açıkça da işaretli.
export const dynamic = "force-dynamic";

/**
 * Bağlantısız hesaplar (hiçbir kuruma bağlı olmayan, süper admin olmayan
 * Auth hesapları) — bkz. lib/super-admin/orphan-users.
 *
 *  GET               → liste (fail-closed: veri eksikse 500, yarım liste YOK)
 *  DELETE ?userId=…  → tek hesabı sil. Karar cleanupOrphanUserIfNeeded'da:
 *                      silme ANINDA üyelik + süper admin kontrolü yeniden
 *                      yapılır (liste açıkken kişi bir kuruma eklenmiş
 *                      olabilir — o durumda SİLİNMEZ, 409).
 */

// Super admin guard — tenant-users / delete-tenant ile aynı sözleşme
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

export async function GET() {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  try {
    const users = await listOrphanUsers(createAdminClient());
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[orphan-users:GET] liste alınamadı:", err);
    return NextResponse.json(
      { error: "Hesaplar alınamadı. Lütfen tekrar deneyin." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "Geçerli bir userId gerekli." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Liste eskimiş olabilir: hesap hâlâ var mı?
  const { data: existing, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !existing?.user) {
    if (!getError || getError.status === 404) {
      return NextResponse.json(
        { error: "Hesap bulunamadı; zaten silinmiş olabilir." },
        { status: 404 }
      );
    }
    console.error("[orphan-users:DELETE] hesap okunamadı:", getError);
    return NextResponse.json({ error: "Silme başarısız oldu." }, { status: 500 });
  }

  // excludeTenantId VERİLMEZ: kişinin HERHANGİ bir üyeliği varsa silinmez.
  const result = await cleanupOrphanUserIfNeeded(admin, userId);

  if (result.deleted) {
    return NextResponse.json({ ok: true, message: "Hesap silindi." }, { status: 200 });
  }
  if (result.reason === "multi-tenant") {
    return NextResponse.json(
      { error: "Bu hesap bu arada bir kuruluşa bağlanmış; silinmedi." },
      { status: 409 }
    );
  }
  if (result.reason === "super-admin") {
    return NextResponse.json({ error: "Süper admin hesabı silinemez." }, { status: 409 });
  }
  // reason === "error" — geçici hata (A2: kalıcı FK engeli yok); tekrar denenebilir.
  return NextResponse.json(
    { error: "Silme başarısız oldu. Lütfen tekrar deneyin." },
    { status: 500 }
  );
}
