
CREATE TABLE public.generated_image_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_image_id uuid NOT NULL REFERENCES public.generated_images(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('original', 'upscale')),
  version_index integer NOT NULL CHECK (version_index >= 0),
  source_asset_id uuid NULL REFERENCES public.generated_image_assets(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL DEFAULT 'generated-images',
  storage_path text NOT NULL,
  width_px integer NULL,
  height_px integer NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL,
  upscale_method text NULL,
  scale_factor numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX idx_gia_generated_image_id ON public.generated_image_assets(generated_image_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uniq_gia_image_version_active
  ON public.generated_image_assets(generated_image_id, version_index)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_image_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_image_assets TO anon;
GRANT ALL ON public.generated_image_assets TO service_role;

ALTER TABLE public.generated_image_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view image assets" ON public.generated_image_assets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert image assets" ON public.generated_image_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update image assets" ON public.generated_image_assets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete image assets" ON public.generated_image_assets FOR DELETE USING (true);

CREATE TRIGGER trg_gia_touch_updated_at
  BEFORE UPDATE ON public.generated_image_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_upscale_jobs_updated_at();

-- Backfill: one original asset per existing generated_images row
INSERT INTO public.generated_image_assets (
  generated_image_id, asset_type, version_index, storage_bucket, storage_path,
  width_px, height_px, mime_type
)
SELECT
  gi.id,
  'original',
  0,
  'generated-images',
  COALESCE(gi.original_storage_path, gi.storage_path),
  COALESCE(gi.base_width_px, gi.actual_width_px),
  COALESCE(gi.base_height_px, gi.actual_height_px),
  'image/png'
FROM public.generated_images gi
WHERE COALESCE(gi.original_storage_path, gi.storage_path) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.generated_image_assets gia
    WHERE gia.generated_image_id = gi.id AND gia.version_index = 0
  );

-- Backfill: if the existing record has an upscale applied with a different stored file, add it as version 1
INSERT INTO public.generated_image_assets (
  generated_image_id, asset_type, version_index, source_asset_id, storage_bucket, storage_path,
  width_px, height_px, mime_type, upscale_method, scale_factor
)
SELECT
  gi.id,
  'upscale',
  1,
  (SELECT id FROM public.generated_image_assets WHERE generated_image_id = gi.id AND version_index = 0 LIMIT 1),
  'generated-images',
  COALESCE(gi.enhanced_storage_path, gi.master_storage_path, gi.storage_path),
  COALESCE(gi.enhanced_width_px, gi.master_width, gi.actual_width_px),
  COALESCE(gi.enhanced_height_px, gi.master_height, gi.actual_height_px),
  'image/png',
  COALESCE(gi.upscale_mode, gi.upscale_method),
  gi.upscale_factor
FROM public.generated_images gi
WHERE gi.upscale_applied = true
  AND COALESCE(gi.enhanced_storage_path, gi.master_storage_path) IS NOT NULL
  AND COALESCE(gi.enhanced_storage_path, gi.master_storage_path) <> COALESCE(gi.original_storage_path, gi.storage_path)
  AND NOT EXISTS (
    SELECT 1 FROM public.generated_image_assets gia
    WHERE gia.generated_image_id = gi.id AND gia.version_index = 1
  );
