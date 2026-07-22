-- Turn 2b: Regenerate completed matching-collection members.
-- Adds an atomic, authenticated RPC that inserts a NEW queued item on the
-- SAME job as the source, carrying `regenerated_from_item_id` lineage.
--
-- Ordering guarantees:
--   * A new UNIQUE partial index prevents concurrent regenerations from
--     colliding on `position` within a single job.
--   * The new item's position is `max(position) + 1` for the job — the
--     original candidate keeps its position.
--
-- Ownership: only the operator who owns the collection may regenerate.
-- Legacy null-profile rows remain read-only from this path (RPC returns
-- 'forbidden' when the caller is not the owner).

BEGIN;

-- Prevent two regenerations of the same source item running concurrently
-- from producing duplicate queued items with the same lineage.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gji_regen_lineage_active
  ON public.generation_job_items (regenerated_from_item_id)
  WHERE regenerated_from_item_id IS NOT NULL
    AND status IN ('queued','dispatching','processing');

CREATE OR REPLACE FUNCTION public.create_matching_collection_regeneration(
  p_source_item_id uuid
) RETURNS TABLE(new_item_id uuid, job_id uuid) AS $$
DECLARE
  v_profile uuid;
  v_src record;
  v_owner uuid;
  v_next_pos int;
  v_new_id uuid;
  v_payload jsonb;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT gji.id, gji.job_id, gji.position, gji.prompt_variant,
         gji.request_payload, gji.status
    INTO v_src
    FROM public.generation_job_items gji
   WHERE gji.id = p_source_item_id;

  IF v_src.id IS NULL THEN RAISE EXCEPTION 'source_not_found'; END IF;
  IF v_src.status <> 'completed' THEN
    RAISE EXCEPTION 'source_not_completed: %', v_src.status;
  END IF;

  SELECT j.profile_id INTO v_owner
    FROM public.generation_jobs j
   WHERE j.id = v_src.job_id;

  -- Legacy null-profile jobs are treated as operator-owned to preserve
  -- single-user access without introducing claim workflows.
  IF v_owner IS NOT NULL AND v_owner <> v_profile THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Must belong to a matching collection.
  IF NOT EXISTS (
    SELECT 1 FROM public.generation_jobs j
     WHERE j.id = v_src.job_id AND j.matching_collection_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'not_matching_collection_job';
  END IF;

  -- Strip terminal + lineage fields from the source payload; ensure we
  -- never carry the completed output back in as a reference.
  v_payload := coalesce(v_src.request_payload, '{}'::jsonb)
             - 'galleryImageId' - 'storagePath' - 'result';

  -- Next position within the same job. The unique partial index above
  -- means only ONE active queued regen per source item survives the race.
  SELECT coalesce(max(position), -1) + 1 INTO v_next_pos
    FROM public.generation_job_items
   WHERE job_id = v_src.job_id;

  INSERT INTO public.generation_job_items (
    job_id, prompt_variant, status, position,
    request_payload, regenerated_from_item_id
  ) VALUES (
    v_src.job_id, v_src.prompt_variant, 'queued', v_next_pos,
    v_payload, p_source_item_id
  ) RETURNING id INTO v_new_id;

  -- Refresh job aggregate — the item-level trigger will do this on the
  -- first status change, but we want the page to see queued immediately.
  UPDATE public.generation_jobs
     SET status = CASE
                    WHEN status IN ('completed','failed','cancelled') THEN 'processing'
                    ELSE status
                  END,
         total_images = total_images + 1,
         updated_at = now()
   WHERE id = v_src.job_id;

  new_item_id := v_new_id;
  job_id := v_src.job_id;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_matching_collection_regeneration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_matching_collection_regeneration(uuid) TO authenticated;

COMMIT;