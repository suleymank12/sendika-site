"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * "Yetkisiz Erişim" ekranı — 20 Eylül 2026'da KENDİNİ AÇIKLAR hâle getirildi.
 *
 * ## Neden değişti (canlı vaka, 20 Eylül 2026)
 *
 * Şifre sıfırlama sonrası kullanıcı bu ekranı gördü, gizli pencerede aynı
 * hesapla sorunsuz girdi ve saatlerce "sistem bozuk" sanıldı. Oysa sunucu
 * bu ekranı TEK bir durumda gösteriyor: *oturum geçerli ama o hesabın BU
 * kurumda üyeliği yok*. Ekranda hangi hesapla girildiği YAZMADIĞI için
 * kimse yanlış hesapla bakıldığını fark edemedi.
 *
 * Artık e-posta ekranda: teşhis tek bakışta yapılıyor.
 *
 * ## Süper admin dalı
 *
 * Platform yöneticisi hesabı hiçbir kuruma üye değildir (19 Eylül kararı:
 * süper admin muafiyeti kaldırıldı, NOTE.md "SÜPER ADMİN KURUM ERİŞİMİ").
 * O hesapla kurum paneline girmek DOĞRU biçimde reddediliyor; ekran bunu
 * açıkça söylüyor ki kullanıcı "yetkim mi yok?" diye tur atmasın.
 *
 * 🔴 SÜPER ADMİN PANELİNİN ADRESİ BURADA YAZILMAZ. Bu sayfa her müşteri
 * domaininde açık; adresi buraya yazmak, middleware kural (b)'nin 404
 * kararını (panel adresi hiçbir kurum host'undan duyurulmaz) tek hamlede
 * boşa çıkarırdı. Yalnız açıklama var, adres yok.
 */
export default function YetkisizPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const oku = async () => {
      const supabase = createClient();

      // getSession(): YEREL okuma, ağ turu yok — ekranda yalnız e-postayı
      // göstereceğiz, kimlik doğrulaması zaten sunucuda yapıldı.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user ?? null;
      setEmail(user?.email ?? null);

      if (user) {
        // Süper adminlik yalnızca MESAJI seçer, hiçbir kapı açmaz.
        // Hata olursa sessizce normal mesaja düşülür (fail-safe).
        const { data, error } = await supabase.rpc("is_super_admin", {
          user_id: user.id,
        });
        if (!error && data === true) setSuperAdmin(true);
      }

      setYukleniyor(false);
    };

    oku();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[YetkisizPage] signOut hatası:", error);
    }
    // Çerez gerçekten temizlensin diye TAM yenileme (router.push değil).
    window.location.href = "/admin/giris";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Yetkisiz Erişim
            </h1>

            {/* Hangi hesapla girildiği — bu ekranın asıl eksiğiydi. */}
            {!yukleniyor && email && (
              <p className="text-sm text-text-dark mt-3 leading-relaxed">
                <span className="text-text-muted">Giriş yapılan hesap:</span>
                <br />
                <span className="font-medium break-all">{email}</span>
              </p>
            )}

            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              {superAdmin
                ? "Bu bir platform yöneticisi hesabı. Platform yöneticileri kurum panellerine erişmez; kurum panelini kullanmak için o kurumun kendi yönetici hesabıyla giriş yapın."
                : "Bu hesabın bu kuruluşun yönetim panelinde yetkisi yok. Yanlış hesapla giriş yapmış olabilirsiniz."}
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSignOut}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Çıkış Yap ve Başka Hesapla Gir
            </button>
            <Link
              href="/"
              className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
