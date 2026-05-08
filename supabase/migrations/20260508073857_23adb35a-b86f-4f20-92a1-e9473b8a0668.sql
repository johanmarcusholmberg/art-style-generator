
DO $$ BEGIN
  CREATE TYPE public.asset_admin_status AS ENUM ('draft','needs_review','approved','rejected','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS admin_status public.asset_admin_status DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_generated_images_admin_status
  ON public.generated_images(admin_status);
