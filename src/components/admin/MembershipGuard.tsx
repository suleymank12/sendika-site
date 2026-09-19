"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";

/**
 * Yetkisi kaldirilmis adminin acik sekmesini kapatir (19 Eylul 2026).
 *
 * SORUN: uyelik kontrolu `admin/(authenticated)/layout.tsx`'te, yani bir
 * SUNUCU bileseninde. Panelin 20 sayfasinin hepsi CLIENT bileseni; Next App
 * Router istemci tarafi gezinmede yalnizca degisen segmenti yeniden cizip
 * paylasilan layout'u ROUTER CACHE'inde tuttugu icin o kontrol HIC
 * CALISMIYOR. Kisi tenant_users'tan cikarildiktan sonra sol menuye
 * tiklamaya devam edebiliyordu.
 *
 * 🟢 OLCULDU — BU BIR ERISIM ACIGI DEGIL: yetki kalktigi anda RLS devreye
 * giriyor ve kisi ANONIM ZIYARETCIYLE BIREBIR AYNI seyi goruyor (10 tablo
 * olculdu; gelen mesajlar 0, taslaklar gizli, tum yazmalar reddediliyor).
 * Kapatilan sey veri erisimi degil, ACIK KALAN EKRAN — ve "isten cikarilan
 * kisinin paneli hala calisiyor" gorunumu musteri icin kabul edilemez.
 *
 * NE ZAMAN KONTROL EDILIR:
 *   - her GEZINMEDE (pathname degisimi) — sorunun tam olarak oldugu yer
 *   - pencere ODAGA geldiginde / sekme GORUNUR oldugunda — asil senaryo
 *     arka planda duran sekme; one geldiginde ilk is bu
 *
 * ⚠️ POLL YOK. Projenin cizgisi bu (Sidebar okunmamis sayaci da olay
 * tabanli, "poll yok" diye yazili). Bostaki sekmenin maliyeti SIFIR;
 * gezinme basina tek, indeksli, tek satirlik sorgu eklenir.
 *
 * 🔴 YETKIDE FAIL-CLOSED, TASIMADA FAIL-OPEN: yalnizca KESIN cevapta
 * (sorgu basarili + 0 satir) cikis yapilir. Ag/sunucu hatasinda HICBIR SEY
 * YAPILMAZ — aksi halde bir baglanti titremesi calisan adminleri panelden
 * atardi.
 */
export default function MembershipGuard({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  const pathname = usePathname();
  // Cikis bir kez tetiklenir: odak + gezinme ayni anda gelirse iki kez
  // yonlendirme denenmesin.
  const leavingRef = useRef(false);

  const check = useCallback(async () => {
    if (!tenant || leavingRef.current) return;

    const supabase = createClient();

    // getSession(): YEREL okuma, ag turu YOK. getUser() her cagride
    // sunucuya gider; bu kontrol her gezinmede kostugu icin gereksiz.
    // Kullanici kimligi burada yalnizca SORGU FILTRESI — gercek sinir
    // yine RLS (sorgu auth.uid() ile de kisitli).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return; // oturum yok -> useIdleTimeout/middleware ilgilenir

    // `(authenticated)/layout.tsx`'teki kontrolun AYNISI: bu kullanici bu
    // kurumun uyesi mi? (Politikanin super admin dali devreye girmesin diye
    // user_id de filtreleniyor — super admin zaten layout'tan giremiyor.)
    const { data, error } = await supabase
      .from("tenant_users")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (error) return; // TASIMADA FAIL-OPEN
    if (data) return; // uye

    leavingRef.current = true;
    // replace + TAM yenileme: sunucu layout'u da ayni karari versin, geri
    // tusu panele donmesin.
    window.location.replace("/admin/yetkisiz");
  }, [tenant]);

  // 1) Her gezinmede
  useEffect(() => {
    check();
  }, [check, pathname]);

  // 2) Pencere odaga geldiginde / sekme gorunur oldugunda
  useEffect(() => {
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  return <>{children}</>;
}
