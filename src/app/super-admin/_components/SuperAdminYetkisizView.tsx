"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";
import Button from "@/components/ui/Button";

/**
 * Giriş yapmış ama süper admin OLMAYAN kullanıcıya gösterilir.
 * (19 Eylül 2026)
 *
 * NEDEN YÖNLENDİRME DEĞİL RENDER: eskiden `/admin/giris`'e redirect
 * ediliyordu. Süper admin kendi host'una taşınınca bu iki nedenle yanlış
 * hale geldi:
 *  (a) O host'ta `/admin` yok (kural (a) 404 veriyor) — yönlendirme
 *      ölü bir adrese giderdi.
 *  (b) Zaten giriş yapmış birini giriş sayfasına atmak, middleware'in
 *      "girişli kullanıcıyı panele al" kuralıyla birleşince DÖNGÜ üretir.
 *
 * Sessiz yönlendirme yerine ne olduğunu söylüyoruz; çıkış düğmesi tek
 * çıkar yol (başka bir hesapla girmek için).
 */
export default function SuperAdminYetkisizView() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Ağ hatası olsa da giriş sayfasına gidilir; oturum orada yeniden kurulur.
    }
    window.location.replace(SUPER_ADMIN_LOGIN_PATH);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 w-fit rounded-full bg-warning/10 p-4">
          <ShieldAlert className="h-8 w-8 text-warning" />
        </div>
        <h1 className="text-lg font-semibold text-text-dark">
          Bu panele erişim yetkiniz yok.
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Hesabınız platform yönetimi için yetkilendirilmemiş. Yanlış hesapla giriş
          yaptıysanız çıkış yapıp tekrar deneyin.
        </p>
        <Button onClick={handleLogout} loading={loading} variant="secondary" className="mt-6">
          Çıkış Yap
        </Button>
      </div>
    </div>
  );
}
