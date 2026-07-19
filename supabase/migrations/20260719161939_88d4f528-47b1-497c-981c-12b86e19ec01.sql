
-- Matching Collection — Stage 2
-- All additive, nullable columns. Existing rows remain valid.

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS anchor_image_id uuid NULL,
  ADD COLUMN IF NOT EXISTS anchor_image_url text NULL,
  ADD COLUMN IF NOT EXISTS anchor_width_px integer NULL,
  ADD COLUMN IF NOT EXISTS anchor_height_px integer NULL,
  ADD COLUMN IF NOT EXISTS anchor_aspect_ratio text NULL,
  ADD COLUMN IF NOT EXISTS art_direction jsonb NULL,
  ADD COLUMN IF NOT EXISTS art_direction_version integer NULL,
  ADD COLUMN IF NOT EXISTS consistency_strength text NULL,
  ADD COLUMN IF NOT EXISTS matching_collection_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_matching_collection
  ON public.generation_jobs (matching_collection_id)
  WHERE matching_collection_id IS NOT NULL;

ALTER TABLE public.generation_job_items
  ADD COLUMN IF NOT EXISTS subject text NULL;

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS anchor_image_id uuid NULL,
  ADD COLUMN IF NOT EXISTS art_direction jsonb NULL,
  ADD COLUMN IF NOT EXISTS art_direction_version integer NULL,
  ADD COLUMN IF NOT EXISTS consistency_strength text NULL,
  ADD COLUMN IF NOT EXISTS matching_collection_job_id uuid NULL,
  ADD COLUMN IF NOT EXISTS anchor_style_key text NULL,
  ADD COLUMN IF NOT EXISTS anchor_poster_format_id text NULL,
  ADD COLUMN IF NOT EXISTS anchor_provider text NULL,
  ADD COLUMN IF NOT EXISTS anchor_model text NULL,
  ADD COLUMN IF NOT EXISTS resolved_provider text NULL,
  ADD COLUMN IF NOT EXISTS resolved_model text NULL,
  ADD COLUMN IF NOT EXISTS provider_substitution_reason text NULL,
  ADD COLUMN IF NOT EXISTS reference_strength text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS matching_collection_id uuid NULL,
  ADD COLUMN IF NOT EXISTS matching_subject text NULL,
  ADD COLUMN IF NOT EXISTS matching_review_state text NULL,
  ADD COLUMN IF NOT EXISTS matching_is_anchor boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_generated_images_matching_collection
  ON public.generated_images (matching_collection_id)
  WHERE matching_collection_id IS NOT NULL;

-- Allow valid review states only (nullable — legacy rows untouched).
ALTER TABLE public.generated_images
  DROP CONSTRAINT IF EXISTS generated_images_matching_review_state_check;
ALTER TABLE public.generated_images
  ADD CONSTRAINT generated_images_matching_review_state_check
  CHECK (matching_review_state IS NULL OR matching_review_state IN ('pending','accepted','rejected'));

-- Constrain consistency_strength values on the two carriers.
ALTER TABLE public.generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_consistency_strength_check;
ALTER TABLE public.generation_jobs
  ADD CONSTRAINT generation_jobs_consistency_strength_check
  CHECK (consistency_strength IS NULL OR consistency_strength IN ('loose','balanced','strict'));

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_consistency_strength_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_consistency_strength_check
  CHECK (consistency_strength IS NULL OR consistency_strength IN ('loose','balanced','strict'));
