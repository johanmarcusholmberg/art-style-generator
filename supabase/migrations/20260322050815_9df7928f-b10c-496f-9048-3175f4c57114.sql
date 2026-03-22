
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS print_format_id text,
  ADD COLUMN IF NOT EXISTS generation_mode text,
  ADD COLUMN IF NOT EXISTS source_width integer,
  ADD COLUMN IF NOT EXISTS source_height integer,
  ADD COLUMN IF NOT EXISTS export_width integer,
  ADD COLUMN IF NOT EXISTS export_height integer,
  ADD COLUMN IF NOT EXISTS export_ready boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS export_type text,
  ADD COLUMN IF NOT EXISTS upscale_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS upscale_method text,
  ADD COLUMN IF NOT EXISTS crop_mode text,
  ADD COLUMN IF NOT EXISTS padding_mode text;
