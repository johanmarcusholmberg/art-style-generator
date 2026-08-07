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
    coalesce(gi.master_image_url, gi.base_image_url, gi.source_image_url),
    coalesce(gi.actual_width_px, gi.master_width, gi.base_width_px, gi.source_width),
    coalesce(gi.actual_height_px, gi.master_height, gi.base_height_px, gi.source_height),
    coalesce(gi.print_format_id, upd.request_payload ->> 'posterFormatId'),
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