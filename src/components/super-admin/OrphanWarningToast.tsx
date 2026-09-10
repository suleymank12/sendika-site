"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { ORPHAN_ACCOUNTS_PATH } from "@/lib/super-admin/orphan-users";

/**
 * 207 (kısmi başarı) uyarısı: asıl iş oldu (admin kaldırıldı / tenant silindi)
 * ama bazı hesaplar silinemedi ve "bağlantısız" kaldı.
 *
 * Neden ⚠️ (ne yeşil başarı ne kırmızı hata): yeşil, kalan işi saklıyordu —
 * eskiden 4 sn'lik toast.success'ti, kimin kaldığı yazmıyordu. Kırmızı ise asıl
 * işin başarısız olduğunu ima ederdi. ℹ️ bilgi toast'ının (tenants/yeni)
 * deseniyle aynı; uzun süreli ve listeye giden bağlantılı.
 */
export function showOrphanWarning(message: string) {
  toast(
    (t) => (
      <span>
        {message}{" "}
        <Link
          href={ORPHAN_ACCOUNTS_PATH}
          onClick={() => toast.dismiss(t.id)}
          className="font-medium underline"
        >
          Bağlantısız Hesaplar
        </Link>{" "}
        sayfasından silebilirsiniz.
      </span>
    ),
    { icon: "⚠️", duration: 12000 }
  );
}
