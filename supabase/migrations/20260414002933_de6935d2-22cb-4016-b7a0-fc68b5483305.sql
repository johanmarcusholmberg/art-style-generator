ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS enhanced_storage_path text,
  ADD COLUMN IF NOT EXISTS master_storage_path text,
  ADD COLUMN IF NOT EXISTS enhancement_model text,
  ADD COLUMN IF NOT EXISTS upscale_factor numeric,
  ADD COLUMN IF NOT EXISTS base_width_px integer,
  ADD COLUMN IF NOT EXISTS base_height_px integer,
  ADD COLUMN IF NOT EXISTS enhanced_width_px integer,
  ADD COLUMN IF NOT EXISTS enhanced_height_px integer;

-- Backfill master_storage_path for existing rows: use storage_path as the base/master
UPDATE public.generated_images
SET master_storage_path = storage_path
WHERE master_storage_path IS NULL;