ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS generation_provider text,
  ADD COLUMN IF NOT EXISTS generation_model text,
  ADD COLUMN IF NOT EXISTS provider_strategy text,
  ADD COLUMN IF NOT EXISTS fallback_used boolean DEFAULT false;