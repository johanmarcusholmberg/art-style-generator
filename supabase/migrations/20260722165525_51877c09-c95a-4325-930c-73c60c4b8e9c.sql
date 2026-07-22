
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
  v_completed_op text;
  v_completed_w int;
  v_completed_h int;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_operation NOT IN ('none','crop','pad') THEN RAISE EXCEPTION 'invalid_operation'; END IF;
  IF p_final_width IS NULL OR p_final_height IS NULL OR p_final_width <= 0 OR p_final_height <= 0 THEN
    RAISE EXCEPTION 'invalid_dimensions';
  END IF;

  SELECT gji.gallery_image_id, gji.ratio_enforcement_status,
         gji.ratio_finalization_claim_token, gji.storage_path,
         gji.finalization_operation,
         gi.master_width, gi.master_height
    INTO v_gallery, v_current_status, v_current_token, v_completed_path,
         v_completed_op, v_completed_w, v_completed_h
    FROM public.generation_job_items gji
    JOIN public.generation_jobs j ON j.id = gji.job_id
    LEFT JOIN public.generated_images gi ON gi.id = gji.gallery_image_id
   WHERE gji.id = p_item_id AND j.profile_id = v_profile;

  IF v_current_status IS NULL THEN RAISE EXCEPTION 'forbidden_or_missing'; END IF;

  -- Idempotent replay: allowed only when EVERY authoritative value matches.
  IF v_current_status = 'completed' THEN
    IF v_completed_path IS DISTINCT FROM p_final_storage_path
       OR v_completed_op IS DISTINCT FROM p_operation
       OR (v_gallery IS NOT NULL AND (
             v_completed_w IS DISTINCT FROM p_final_width
             OR v_completed_h IS DISTINCT FROM p_final_height))
    THEN
      RAISE EXCEPTION 'idempotent_replay_conflict';
    END IF;
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

    -- Keep the versioned "original" asset row aligned with the corrected master.
    UPDATE public.generated_image_assets
       SET storage_path = p_final_storage_path,
           width_px = p_final_width,
           height_px = p_final_height,
           mime_type = coalesce(mime_type, 'image/png'),
           updated_at = now()
     WHERE generated_image_id = v_gallery
       AND asset_type = 'original'
       AND version_index = 0
       AND deleted_at IS NULL;
  END IF;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.complete_generation_ratio_finalization(uuid, uuid, text, text, integer, integer, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_generation_ratio_finalization(uuid, uuid, text, text, integer, integer, text, jsonb) TO authenticated;
