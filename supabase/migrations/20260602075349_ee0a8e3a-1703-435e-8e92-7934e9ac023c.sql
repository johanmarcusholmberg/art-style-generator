ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS rating smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.generated_images
  DROP CONSTRAINT IF EXISTS generated_images_rating_range_chk;
ALTER TABLE public.generated_images
  ADD CONSTRAINT generated_images_rating_range_chk
  CHECK (rating >= 0 AND rating <= 5);

CREATE INDEX IF NOT EXISTS generated_images_rating_idx ON public.generated_images (rating);
CREATE INDEX IF NOT EXISTS generated_images_is_favorite_idx ON public.generated_images (is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS generated_images_is_archived_idx ON public.generated_images (is_archived) WHERE is_archived = true;