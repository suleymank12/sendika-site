import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { yazmaHataYaniti } from "@/lib/yazma-yaniti";
import { cleanupOrphanUserIfNeeded } from "@/lib/super-admin/cleanup-orphan-user";
import { isUuid, listOrphanUsers } from "@/lib/super-admin/orphan-users";
import { requireSuperAdminHost } from "@/lib/super-admin/api-host-guard";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";

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

// Super admin yetki kapisi: lib/super-admin/require-super-admin (C8 — rpc HATASI 503, 403 degil).

export async function GET(req: NextRequest) {
  // Host kapisi — auth'tan ONCE (bkz. lib/super-admin/api-host-guard).
  const denied = requireSuperAdminHost(req);
  if (denied) return denied;

  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  try {
    const users = await listOrphanUsers(createAdminClient("admin-okuma"));
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
  // Host kapisi — auth'tan ONCE (bkz. lib/super-admin/api-host-guard).
  const denied = requireSuperAdminHost(req);
  if (denied) return denied;

  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "Geçerli bir userId gerekli." }, { status: 400 });
  }

  const admin = createAdminClient("yazma");

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
  // C3: deleteUser 25 sn ust sinirda kesildiyse sonuc BELIRSIZ (504).
  return yazmaHataYaniti({ message: "error" in result ? result.error : "" }, "Silme başarısız oldu. Lütfen tekrar deneyin.");
}
