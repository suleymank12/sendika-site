-- ============================================================
-- 010_super_admin.sql
-- FAZ 3: Süper admin altyapısı
--
-- - is_super_admin(user_id) yardımcı fonksiyonu
--   raw_user_meta_data->>'is_super_admin' = 'true' ise döner
--
-- ÖNEMLİ:
--  - Bir kullanıcıyı süper admin yapmak için:
--    UPDATE auth.users
--    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
--                              || '{"is_super_admin": true}'::jsonb
--    WHERE email = 'kullanici@ornek.com';
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = user_id
      AND raw_user_meta_data->>'is_super_admin' = 'true'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- authenticated rolü için EXECUTE izni
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO anon;
