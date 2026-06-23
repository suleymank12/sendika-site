-- Default tenant pasiflenemez (sistem icin gerekli)
-- Pasif tenant'lar default'a dusmedigi icin, default tenant'in kazara
-- pasiflenmesi tum platformu (her subdomain) kapatir. Bu trigger onu engeller.

CREATE OR REPLACE FUNCTION public.prevent_default_tenant_deactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug = 'default' AND NEW.is_active = false THEN
    RAISE EXCEPTION 'Default tenant pasiflenemez (sistem icin gerekli)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_default_tenant_active ON public.tenants;

CREATE TRIGGER protect_default_tenant_active
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  WHEN (OLD.slug = 'default')
  EXECUTE FUNCTION public.prevent_default_tenant_deactivation();
