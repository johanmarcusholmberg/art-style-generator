-- Format-derivative lineage columns on public.generated_images.
--
-- STATUS: READY, NOT YET APPLIED. The live Supabase connection is
-- currently unstable, so per the task brief we're NOT retrying this
-- migration right now. Keep this file until Supabase is healthy.
--
-- HOW TO APPLY when Supabase is healthy:
--   Use the `supabase--migration` tool with the SQL body below (from
--   the first `ALTER TABLE` line through the last `COMMENT ON`). The
--   migration is additive-only, all new columns are nullable or have
--   safe defaults, and legacy rows continue to satisfy every constraint.
--
-- WHAT IT ADDS on public.generated_images:
--   • source_image_id           uuid, FK → generated_images(id), ON DELETE SET NULL
--   • source_format             text
--   • target_format             text
--   • crop_box                  jsonb  ({x,y,width,height} in source pixels)
--   • derived_from_master       boolean NOT NULL DEFAULT false
-- Plus two partial indexes for lookup speed.
--
-- No RLS changes required — generated_images already has policies that
-- cover these columns implicitly. No new GRANTs required — the table's
-- existing grants apply.

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS source_image_id uuid NULL
    REFERENCES public.generated_images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_format text NULL,
  ADD COLUMN IF NOT EXISTS target_format text NULL,
  ADD COLUMN IF NOT EXISTS crop_box jsonb NULL,
  ADD COLUMN IF NOT EXISTS derived_from_master boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_generated_images_source_image_id
  ON public.generated_images(source_image_id)
  WHERE source_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generated_images_derived_from_master
  ON public.generated_images(derived_from_master)
  WHERE derived_from_master = true;

COMMENT ON COLUMN public.generated_images.source_image_id IS
  'When derived_from_master is true, points at the approved poster master this derivative was cropped from.';
COMMENT ON COLUMN public.generated_images.crop_box IS
  'JSON { x, y, width, height } in source pixels — the crop rectangle applied before resize. NULL for non-derivatives.';
COMMENT ON COLUMN public.generated_images.derived_from_master IS
  'True when this row was produced by the crop-only format-derivative workflow (no AI regeneration).';
