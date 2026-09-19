"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, KeyRound, ShieldCheck } from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import ListLoadError from "@/components/admin/ListLoadError";
import Loading from "@/components/ui/Loading";
import { formatDate } from "@/lib/utils";

/**
 * Panel Yöneticileri — SALT OKUNUR (P2 — şeffaflık, 19 Eylül 2026).
 *
 * NEDEN VAR: P1'de süper adminin kurum verisine otomatik erişimi kaldırıldı;
 * artık bir kurumda iş yapacaksa önce kendini o kurumun yönetici listesine
 * ekliyor, yani erişim bir `tenant_users` satırı olarak İZ BIRAKIYOR. Ama o
 * izi müşteri göremiyordu — bu ekran onu gösteriyor.
 *
 * KVKK: müşteri = veri sorumlusu; md. 12 ona verisinin güvenliğini sağlama
 * yükümlülüğü veriyor. "Verime kim erişebiliyor?" sorusunun cevabı burada.
 * Veri minimizasyonu (md. 4): yalnız e-posta + tarih + rozet gösteriliyor.
 *
 * Liste `/api/panel-yoneticileri`'nden geliyor — e-postalar `auth.users`'ta
 * ve o şema tarayıcıya kapalı. Yetkilendirmeyi RLS taşıyor (migration 030).
 */

interface Yonetici {
  email: string;
  eklendi: string;
  platform: boolean;
}

export default function PanelYoneticileriPage() {
  const [list, setList] = useState<Yonetici[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/panel-yoneticileri");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = await res.json();
      setList(Array.isArray(data?.yoneticiler) ? data.yoneticiler : []);
    } catch {
      // Hata durumunda BOŞ LİSTE gösterilmez (ListLoadError'ın var olma
      // nedeni): "kimse yok" ile "okunamadı" aynı şey değil.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <>
      <AdminHeader
        title="Panel Yöneticileri"
        description="Bu panele girebilen kişiler."
        helpTopic="panel-yoneticileri"
      />

      <div className="p-4 lg:p-6 space-y-4">
        {/* Salt okunur açıklaması — liste var, "Ekle" düğmesi yok; kullanıcı
            düğmeyi aramasın ve ekranın NEDEN var olduğu anlaşılsın. */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-light/60 px-4 py-3 text-sm text-text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong className="font-medium text-text-dark">Bu liste salt okunurdur.</strong>{" "}
            Panele yeni bir yönetici eklemek ya da birini çıkarmak için platform ekibiyle
            iletişime geçin. Liste, sitenizin verisine kimlerin erişebildiğini gösterir.
          </p>
        </div>

        {loading ? (
          <Loading className="py-12" text="Yükleniyor..." />
        ) : failed ? (
          <ListLoadError onRetry={fetchList} />
        ) : (
          <div className="rounded-xl bg-white border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {(list || []).map((y) => (
                <li
                  key={y.email || y.eklendi}
                  className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div
                    className={
                      y.platform
                        ? "rounded-lg bg-amber-50 p-2 shrink-0 w-fit"
                        : "rounded-lg bg-bg-light p-2 shrink-0 w-fit"
                    }
                  >
                    {y.platform ? (
                      <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden />
                    ) : (
                      <KeyRound className="h-4 w-4 text-text-muted" aria-hidden />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-dark break-all">
                      {y.email || "(e-posta yok)"}
                    </p>
                    {y.platform && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Sitenizi kuran ve teknik destek veren ekip. Genellikle geçici
                        olarak eklenir.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {y.platform && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Platform yöneticisi
                      </span>
                    )}
                    <span className="text-xs text-text-muted">{formatDate(y.eklendi)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
