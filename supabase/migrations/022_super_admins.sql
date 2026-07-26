-- ============================================================================
-- Migration 022: super_admins tablosu — K1 guvenlik acigi duzeltmesi
-- ============================================================================
--
-- ACIK (KRITIK / deploy blokeri):
--   is_super_admin (010_super_admin.sql:16-25) yetkiyi
--   auth.users.raw_user_meta_data->>'is_super_admin' alanindan okuyordu.
--   Bu alan = user_metadata = KULLANICININ KENDISI yazabilir:
--       await supabase.auth.updateUser({ data: { is_super_admin: true } })
--   Sonuc: herhangi bir tenant admini tek istekle super admin olabiliyordu
--   -> user_has_tenant_access her tenant icin TRUE -> tum tenant'larin tum
--      verisine sinirsiz okuma/yazma/silme + tum super-admin endpoint'leri.
--
-- COZUM:
--   Yetki kaynagi public.super_admins tablosuna tasinir. Tablo RLS acik ve
--   KASITLI OLARAK POLICY'SIZ birakilir -> anon/authenticated hicbir islem
--   yapamaz (kullanici kendini super admin YAPAMAZ). is_super_admin
--   SECURITY DEFINER oldugu icin (owner = postgres, tablo sahibi de postgres)
--   RLS'i bypass ederek tabloyu okuyabilir.
--   Ayni desen 021_contact_messages.sql'deki contact_rate_limit tablosunda
--   zaten kullaniliyor ("RLS acik + policy yok = yalniz service role").
--
-- IMZA KORUNDU (kritik):
--   is_super_admin(user_id UUID) -> BOOLEAN imzasi DEGISMEDI. Bu sayede
--   10 TS RPC cagrisi (middleware, 2 layout, login formu, 6 API route) ve
--   ~28 RLS policy (012 dogrudan + user_has_tenant_access uzerinden dolayli)
--   DOKUNULMADAN calismaya devam eder. Yalnizca fonksiyon GOVDESI degisti.
--
-- ETKI: Idempotent (CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING,
--   CREATE OR REPLACE). Tek transaction icinde calisir: tablo ONCE dolar,
--   fonksiyon SONRA degisir -> super adminin yetkisiz kaldigi an OLUSMAZ.
--
-- ELLE APPLY: NOTE.md "elle apply" modeli — Supabase SQL Editor'dan
--   calistirilir. Apply sonrasi dogrulama ve sonraki adimlar icin dosya
--   sonundaki bloklara bakin.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) super_admins tablosu
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.super_admins IS
  'Platform super admin listesi (tek dogruluk kaynagi). RLS acik + policy YOK '
  '= anon/authenticated erisemez. Yalnizca is_super_admin (SECURITY DEFINER) '
  've service role okur. Yeni super admin: INSERT ile eklenir.';

-- ON DELETE CASCADE: auth.users kaydi silinirse yetki de otomatik duser
-- (yetim bayrak kalmaz — user_metadata deseninin bir zayifligi daha kapanir).

-- RLS: acik, ama HICBIR POLICY YOK.
-- => anon ve authenticated icin SELECT/INSERT/UPDATE/DELETE tamamen kapali.
-- => Kullanici kendini super admin yapamaz (K1'in koku tam olarak buydu).
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- !!! FORCE ROW LEVEL SECURITY EKLEMEYIN !!!
-- Eklenirse tablo sahibi (postgres) de RLS'e tabi olur; is_super_admin
-- SECURITY DEFINER fonksiyonu tabloyu OKUYAMAZ hale gelir, herkes icin
-- FALSE doner ve super-admin panelinin tamami kilitlenir.

-- ============================================================================
-- 2) Mevcut super admin'i tasi (VERI GUDUMLU — e-posta HARDCODE EDILMEZ)
-- ============================================================================
-- Kimin super admin oldugu auth.users'tan okunur: yazim hatasi riski yok,
-- birden fazla isaretli hesap varsa hepsi tasinir, kimse disarida kalmaz.
INSERT INTO public.super_admins (user_id, note)
SELECT id, 'migrated from user_metadata: ' || COALESCE(email, id::text)
FROM auth.users
WHERE raw_user_meta_data->>'is_super_admin' = 'true'
ON CONFLICT (user_id) DO NOTHING;

-- IDEMPOTENTLIK NOTU: Bu migration, ADIM 5'ten (eski bayrak temizligi)
-- SONRA tekrar calistirilirsa bu INSERT hicbir satir eklemez (kaynak alan
-- bosalmis olur). Tablo verisi zaten yerinde durdugu icin bu ZARARSIZDIR.

-- ============================================================================
-- 3) is_super_admin — GOVDE degisir, IMZA aynen korunur
-- ============================================================================
-- Degisiklikler:
--   a) Kaynak: auth.users.raw_user_meta_data -> public.super_admins
--   b) SET search_path = public EKLENDI (010'da eksikti; SECURITY DEFINER
--      fonksiyonda search_path sabitlemesi guvenlik icin sart — 020:35'te
--      belgelenen disiplinin 010'a da uygulanmasi)
--   c) LANGUAGE plpgsql -> sql (user_has_tenant_access ile tutarli)
--
-- CREATE OR REPLACE parametre ADINI degistiremez ("cannot change name of
-- input parameter") — bu yuzden parametre adi user_id olarak KALIR.
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- !!! PARAMETRE GOLGELEME TUZAGI !!!
  -- Parametre adi "user_id", super_admins kolonu da "user_id".
  -- Nitelenmemis "WHERE user_id = user_id" yazilirsa kosul HER ZAMAN TRUE
  -- olur ve HERKES super admin olur. Bu yuzden:
  --   sol taraf  -> sa.user_id            (tablo kolonu, alias ile)
  --   sag taraf  -> is_super_admin.user_id (fonksiyon parametresi, fonksiyon
  --                                         adiyla nitelenmis)
  -- Dogrulama icin dosya sonundaki (b) sorgusunu MUTLAKA calistirin.
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = is_super_admin.user_id
  );
$$;

COMMENT ON FUNCTION public.is_super_admin(UUID) IS
  'Kullanici super admin mi? Kaynak: public.super_admins (022). '
  'ONCEDEN user_metadata okunuyordu — kullanici kendi yazabildigi icin '
  'yetki yukseltmeye aciktir, ASLA geri donulmemeli.';

-- ============================================================================
-- 4) EXECUTE izinleri
-- ============================================================================
-- PostgreSQL yeni fonksiyonlara VARSAYILAN olarak PUBLIC'e EXECUTE verir ve
-- anon rolu PUBLIC uyesidir. Bu yuzden yalnizca "REVOKE ... FROM anon" YETMEZ;
-- once PUBLIC'ten alinip sonra gereken roller TEK TEK verilmelidir.
REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM anon;

-- authenticated: 10 TS RPC cagrisi + dogrudan RLS policy ifadeleri
-- (tenants_super_admin_*, tenant_users_*) icin ZORUNLU.
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- service_role: cleanup-orphan-user.ts artik bu RPC'yi service role client
-- ile cagiriyor. PUBLIC grant'i kaldirildigi icin ACIKCA verilmelidir.
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO service_role;

-- NOT: user_has_tenant_access icinden yapilan is_super_admin cagrisi bu
-- REVOKE'tan ETKILENMEZ — o fonksiyon da SECURITY DEFINER'dir, govdesi
-- sahibi (postgres) yetkisiyle calisir ve sahip her zaman EXECUTE edebilir.

COMMIT;

-- ============================================================================
-- APPLY SONRASI DOGRULAMA — bu sorgulari AYRI AYRI calistirin
-- ============================================================================
--
-- (a) Super admin tasindi mi? (en az 1 satir donmeli)
--     SELECT sa.user_id, u.email, sa.note
--     FROM public.super_admins sa
--     JOIN auth.users u ON u.id = sa.user_id;
--
-- (b) PARAMETRE GOLGELEME KONTROLU — EN KRITIK DOGRULAMA:
--     Var olmayan bir UUID icin MUTLAKA false donmeli.
--     true donerse govdede golgeleme hatasi var demektir (HERKES super admin
--     olur) -> hemen asagidaki ROLLBACK'i uygulayin.
--     SELECT public.is_super_admin('00000000-0000-0000-0000-000000000000'::uuid);
--     -- beklenen: false
--
-- (c) Gercek super admin(ler) icin true donmeli:
--     SELECT u.email, public.is_super_admin(u.id) AS yetkili
--     FROM auth.users u
--     WHERE u.id IN (SELECT user_id FROM public.super_admins);
--     -- beklenen: her satirda yetkili = true
--
-- (d) Fonksiyon tanimi beklendigi gibi mi (drift kontrolu)?
--     SELECT pg_get_functiondef('public.is_super_admin(uuid)'::regprocedure);
--
-- (e) Izinler dogru mu? (anon GORUNMEMELI)
--     SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--     WHERE routine_name = 'is_super_admin';
--
-- ============================================================================
-- ADIM 5 — ESKI BAYRAGI TEMIZLE (yalnizca tum testler GECTIKTEN sonra!)
-- ============================================================================
-- Bu adim, acigi sombellemis olabilecek hesaplarin bayragini da temizler.
-- CALISTIRDIKTAN SONRA asagidaki ROLLBACK ARTIK ISE YARAMAZ.
--
--     UPDATE auth.users
--     SET raw_user_meta_data = raw_user_meta_data - 'is_super_admin'
--     WHERE raw_user_meta_data ? 'is_super_admin';
--
-- ============================================================================
-- ROLLBACK (yalnizca ADIM 5 CALISTIRILMADAN ONCE gecerlidir)
-- ============================================================================
-- Fonksiyonu 010'daki haline dondurur (super_admins tablosu zararsiz kalir):
--
--     CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
--     RETURNS BOOLEAN AS '
--     BEGIN
--       RETURN EXISTS (SELECT 1 FROM auth.users
--                      WHERE id = user_id
--                        AND raw_user_meta_data->>''is_super_admin'' = ''true'');
--     END;
--     ' LANGUAGE plpgsql SECURITY DEFINER STABLE;
--     GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
--     GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO service_role;
--
-- ============================================================================
-- Migration 022 sonu
-- ============================================================================
