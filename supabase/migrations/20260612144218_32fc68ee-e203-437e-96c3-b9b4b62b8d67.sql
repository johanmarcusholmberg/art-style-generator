ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS auto_upscale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_upscale_mode text NOT NULL DEFAULT 'tile_4x';