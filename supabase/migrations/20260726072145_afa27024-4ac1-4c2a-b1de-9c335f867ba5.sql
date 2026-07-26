CREATE OR REPLACE FUNCTION public.report_current_generation_safety_state(p_limit integer DEFAULT 100)
RETURNS TABLE(category text, entity_id uuid, detected_at timestamp with time zone, detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 'legacy_null_profile_collection'::text,
         c.id,
         c.created_at,
         jsonb_build_object(
           'name', c.name,
           'status', c.status,
           'fingerprint', c.fingerprint,
           'matching_collection_job_id', c.matching_collection_job_id,
           'anchor_image_id', c.anchor_image_id
         )
    FROM public.collections c
   WHERE c.profile_id IS NULL
   ORDER BY c.created_at DESC
   LIMIT v_limit;

  RETURN QUERY
  SELECT 'expired_ratio_finalization_processing'::text,
         gji.id,
         gji.ratio_finalization_lease_expires_at,
         jsonb_build_object(
           'job_id', gji.job_id,
           'gallery_image_id', gji.gallery_image_id,
           'attempts', gji.ratio_finalization_attempts,
           'error', gji.ratio_finalization_error,
           'lease_expires_at', gji.ratio_finalization_lease_expires_at,
           'started_at', gji.ratio_finalization_started_at
         )
    FROM public.generation_job_items gji
   WHERE gji.ratio_enforcement_status = 'processing'
     AND gji.ratio_finalization_lease_expires_at IS NOT NULL
     AND gji.ratio_finalization_lease_expires_at < now()
   ORDER BY gji.ratio_finalization_lease_expires_at ASC
   LIMIT v_limit;

  RETURN QUERY
  SELECT 'completed_item_missing_canonical_asset'::text,
         gji.id,
         gji.completed_at,
         jsonb_build_object(
           'job_id', gji.job_id,
           'gallery_image_id', gji.gallery_image_id,
           'storage_path', gji.storage_path,
           'ratio_enforcement_status', gji.ratio_enforcement_status,
           'has_gallery_row', (gi.id IS NOT NULL),
           'gallery_storage_path', gi.storage_path
         )
    FROM public.generation_job_items gji
    LEFT JOIN public.generated_images gi ON gi.id = gji.gallery_image_id
   WHERE gji.status = 'completed'
     AND gji.completed_at > now() - interval '7 days'
     AND (
       gji.gallery_image_id IS NULL
       OR gi.id IS NULL
       OR coalesce(gi.storage_path, '') = ''
     )
   ORDER BY gji.completed_at DESC
   LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.report_current_generation_safety_state(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_current_generation_safety_state(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_current_generation_safety_state(integer) TO service_role;