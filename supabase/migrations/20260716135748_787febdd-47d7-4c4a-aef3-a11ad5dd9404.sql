
-- 1. Lineage: link generated_images ↔ generation_job_items (idempotent)
ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS generation_job_id uuid,
  ADD COLUMN IF NOT EXISTS generation_job_item_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS generated_images_job_item_uidx
  ON public.generated_images (generation_job_item_id)
  WHERE generation_job_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generated_images_job_idx
  ON public.generated_images (generation_job_id)
  WHERE generation_job_id IS NOT NULL;

-- 2. Cost events: link + partial unique (one generation cost event per item)
ALTER TABLE public.asset_cost_events
  ADD COLUMN IF NOT EXISTS generation_job_item_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS asset_cost_events_gen_item_uidx
  ON public.asset_cost_events (generation_job_item_id, event_type)
  WHERE generation_job_item_id IS NOT NULL;

-- 3. Prompt history: link (one row per item; created server-side on completion)
ALTER TABLE public.prompt_history
  ADD COLUMN IF NOT EXISTS generation_job_item_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_history_gen_item_uidx
  ON public.prompt_history (generation_job_item_id)
  WHERE generation_job_item_id IS NOT NULL;

-- 4. Print-replay lineage on jobs (self-referencing, nullable)
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS source_job_id uuid,
  ADD COLUMN IF NOT EXISTS source_item_id uuid,
  ADD COLUMN IF NOT EXISTS source_gallery_image_id uuid;

CREATE INDEX IF NOT EXISTS generation_jobs_source_job_idx
  ON public.generation_jobs (source_job_id)
  WHERE source_job_id IS NOT NULL;

-- 5. Atomic "find or reserve" helper for idempotent persistence.
--    Returns the existing gallery_image_id if the item already produced one
--    (via generation_job_items.gallery_image_id OR generated_images.generation_job_item_id).
--    Otherwise returns NULL — caller inserts and then links.
CREATE OR REPLACE FUNCTION public.find_image_for_job_item(p_item_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT gji.gallery_image_id FROM public.generation_job_items gji WHERE gji.id = p_item_id),
    (SELECT gi.id FROM public.generated_images gi
       WHERE gi.generation_job_item_id = p_item_id LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.find_image_for_job_item(uuid) TO service_role;
