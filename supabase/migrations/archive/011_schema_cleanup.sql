-- =====================================================
-- Migration 011: Schema cleanup
-- - Plan kavramı kaldırılıyor (tüm tenant'lar eşit özelliklere sahip)
-- - quick_access tablosu drop ediliyor (veri 005 ile homepage_sections'a taşındı, kod referansı yok)
-- =====================================================

BEGIN;

-- 1) Plan kolonu kaldır
ALTER TABLE public.tenants DROP COLUMN IF EXISTS plan;

-- 2) Ölü quick_access tablosu kaldır (RLS politikaları otomatik düşer)
DROP TABLE IF EXISTS public.quick_access CASCADE;

COMMIT;
