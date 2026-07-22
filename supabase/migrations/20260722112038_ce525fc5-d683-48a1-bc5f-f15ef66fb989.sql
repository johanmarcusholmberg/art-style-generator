
-- Turn 2c.2 sub-turn A: durable ratio-finalization state machine.

ALTER TABLE public.generation_job_items
  ADD COLUMN IF NOT EXISTS ratio_finalization_claim_token uuid,
  ADD COLUMN IF NOT EXISTS ratio_finalization_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS ratio_finalization_error text,
  ADD COLUMN IF NOT EXISTS ratio_finalization_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratio_finalization_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ratio_finalization_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalization_operation text,
  ADD COLUMN IF NOT EXISTS finalization_metadata jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gji_finalization_operation_check'
  ) THEN
    ALTER TABLE public.generation_job_items
      ADD CONSTRAINT gji_finalization_operation_check
      CHECK (finalization_operation IS NULL OR finalization_operation IN ('none','crop','pad'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS gji_ratio_finalization_idx
  ON public.generation_job_items (ratio_enforcement_status, ratio_finalization_lease_expires_at)
  WHERE ratio_enforcement_status IN ('pending','processing');

-- Claim: transition pending (or expired-processing) → processing with a fresh token.
CREATE OR REPLACE FUNCTION public.claim_generation_ratio_finalization(
  p_item_id uuid,
  p_lease_seconds integer DEFAULT 600
)
RETURNS TABLE(
  item_id uuid,
  claim_token uuid,
  gallery_image_id uuid,
  source_storage_path text,
  source_image_url text,
  source_width integer,
  source_height integer,
  poster_format_id text,
  target_aspect_ratio text,
  correction_policy text,
  attempts integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_updated int;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.generation_job_items gji
    JOIN public.generation_jobs j ON j.id = gji.job_id
    WHERE gji.id = p_item_id AND j.profile_id = v_profile
  ) THEN
    RAISE EXCEPTION 'forbidden_or_missing';
  END IF;

  RETURN QUERY
  WITH locked AS (
    SELECT gji.id
      FROM public.generation_job_items gji
     WHERE gji.id = p_item_id
       AND gji.ratio_enforcement_status IN ('pending','processing')
       AND (
         gji.ratio_finalization_claim_token IS NULL
         OR gji.ratio_finalization_lease_expires_at IS NULL
         OR gji.ratio_finalization_lease_expires_at < v_now
       )
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.generation_job_items gji
       SET ratio_enforcement_status = 'processing',
           ratio_finalization_claim_token = v_token,
           ratio_finalization_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           ratio_finalization_started_at = coalesce(gji.ratio_finalization_started_at, v_now),
           ratio_finalization_attempts = gji.ratio_finalization_attempts + 1,
           ratio_finalization_error = NULL,
           updated_at = v_now
      FROM locked
     WHERE gji.id = locked.id
     RETURNING gji.id, gji.gallery_image_id, gji.request_payload, gji.ratio_finalization_attempts
  )
  SELECT
    upd.id,
    v_token,
    upd.gallery_image_id,
    gi.storage_path,
    coalesce(gi.image_url, gi.master_image_url, gi.base_image_url),
    coalesce(gi.actual_width_px, gi.master_width, gi.base_width_px, gi.source_width),
    coalesce(gi.actual_height_px, gi.master_height, gi.base_height_px, gi.source_height),
    coalesce(gi.poster_format_id, upd.request_payload ->> 'posterFormatId'),
    coalesce(gi.aspect_ratio, upd.request_payload ->> 'aspectRatio'),
    coalesce(upd.request_payload ->> 'ratioCorrectionMode', 'pad'),
    upd.ratio_finalization_attempts
  FROM upd
  LEFT JOIN public.generated_images gi ON gi.id = upd.gallery_image_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not_claimable';
  END IF;
END $$;

-- Complete: only the active claim token can flip processing → completed.
CREATE OR REPLACE FUNCTION public.complete_generation_ratio_finalization(
  p_item_id uuid,
  p_claim_token uuid,
  p_final_storage_path text,
  p_final_image_url text,
  p_final_width integer,
  p_final_height integer,
  p_operation text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_gallery uuid;
  v_current_status text;
  v_current_token uuid;
  v_completed_path text;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_operation NOT IN ('none','crop','pad') THEN RAISE EXCEPTION 'invalid_operation'; END IF;
  IF p_final_width IS NULL OR p_final_height IS NULL OR p_final_width <= 0 OR p_final_height <= 0 THEN
    RAISE EXCEPTION 'invalid_dimensions';
  END IF;

  SELECT gji.gallery_image_id, gji.ratio_enforcement_status,
         gji.ratio_finalization_claim_token, gji.storage_path
    INTO v_gallery, v_current_status, v_current_token, v_completed_path
    FROM public.generation_job_items gji
    JOIN public.generation_jobs j ON j.id = gji.job_id
   WHERE gji.id = p_item_id AND j.profile_id = v_profile;

  IF v_current_status IS NULL THEN RAISE EXCEPTION 'forbidden_or_missing'; END IF;

  -- Idempotent replay: already completed on the same destination path.
  IF v_current_status = 'completed' AND v_completed_path IS NOT DISTINCT FROM p_final_storage_path THEN
    RETURN true;
  END IF;

  IF v_current_status <> 'processing' OR v_current_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'invalid_claim';
  END IF;

  UPDATE public.generation_job_items
     SET ratio_enforcement_status = 'completed',
         enforced_image_url = p_final_image_url,
         image_url = p_final_image_url,
         storage_path = p_final_storage_path,
         finalization_operation = p_operation,
         finalization_metadata = p_metadata,
         ratio_finalization_completed_at = now(),
         ratio_finalization_claim_token = NULL,
         ratio_finalization_lease_expires_at = NULL,
         ratio_finalization_error = NULL,
         updated_at = now()
   WHERE id = p_item_id;

  IF v_gallery IS NOT NULL THEN
    UPDATE public.generated_images
       SET image_url = p_final_image_url,
           storage_path = p_final_storage_path,
           master_image_url = p_final_image_url,
           master_storage_path = p_final_storage_path,
           master_width = p_final_width,
           master_height = p_final_height,
           actual_width_px = p_final_width,
           actual_height_px = p_final_height,
           updated_at = now()
     WHERE id = v_gallery;
  END IF;

  RETURN true;
END $$;

-- Fail: only the active claim token can flip processing → failed.
CREATE OR REPLACE FUNCTION public.fail_generation_ratio_finalization(
  p_item_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_updated int;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.generation_job_items gji
     SET ratio_enforcement_status = 'failed',
         ratio_finalization_error = coalesce(p_error, 'unknown_error'),
         ratio_finalization_claim_token = NULL,
         ratio_finalization_lease_expires_at = NULL,
         updated_at = now()
   FROM public.generation_jobs j
   WHERE gji.id = p_item_id
     AND gji.job_id = j.id
     AND j.profile_id = v_profile
     AND gji.ratio_enforcement_status = 'processing'
     AND gji.ratio_finalization_claim_token = p_claim_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END $$;

-- Retry: failed → pending, preserving attempt history.
CREATE OR REPLACE FUNCTION public.retry_generation_ratio_finalization(
  p_item_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_updated int;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.generation_job_items gji
     SET ratio_enforcement_status = 'pending',
         ratio_finalization_error = NULL,
         ratio_finalization_claim_token = NULL,
         ratio_finalization_lease_expires_at = NULL,
         updated_at = now()
   FROM public.generation_jobs j
   WHERE gji.id = p_item_id
     AND gji.job_id = j.id
     AND j.profile_id = v_profile
     AND gji.ratio_enforcement_status = 'failed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END $$;

REVOKE ALL ON FUNCTION public.claim_generation_ratio_finalization(uuid, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_generation_ratio_finalization(uuid, uuid, text, text, integer, integer, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.fail_generation_ratio_finalization(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.retry_generation_ratio_finalization(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.claim_generation_ratio_finalization(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_generation_ratio_finalization(uuid, uuid, text, text, integer, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_generation_ratio_finalization(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_generation_ratio_finalization(uuid) TO authenticated;
