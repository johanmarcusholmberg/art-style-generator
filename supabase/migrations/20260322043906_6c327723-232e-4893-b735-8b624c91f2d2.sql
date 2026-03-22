
-- Add print quality metadata to generated_images
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS quality_mode text DEFAULT 'quality',
  ADD COLUMN IF NOT EXISTS target_ppi integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_width_px integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_height_px integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_width_px integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_height_px integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enhanced boolean DEFAULT false;

-- Add print quality fields to generation_jobs
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS target_ppi integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_width_px integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_height_px integer DEFAULT NULL;
