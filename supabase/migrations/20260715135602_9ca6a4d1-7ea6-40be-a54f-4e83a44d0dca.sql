CREATE INDEX IF NOT EXISTS idx_generated_images_created_at_desc ON public.generated_images (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_images_mode_created_at ON public.generated_images (mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_images_deleted_at ON public.generated_images (deleted_at) WHERE deleted_at IS NULL;