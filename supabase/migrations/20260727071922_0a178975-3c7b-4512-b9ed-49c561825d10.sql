CREATE OR REPLACE FUNCTION public.report_current_generation_safety_state(p_limit integer DEFAULT 100)
 RETURNS TABLE(category text, entity_id uuid, detected_at timestamp with time zone, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         jsonb_build_object('collection_id', c.id)
    FROM public.collections c
   WHERE c.profile_id IS NULL
   ORDER BY c.created_at DESC
   LIMIT v_limit;

  RETURN QUERY
  SELECT 'expired_ratio_finalization_processing'::text,
         gji.id,
         coalesce(gji.ratio_finalization_lease_expires_at, gji.updated_at),
         jsonb_build_object(
           'item_id', gji.id,
           'job_id', gji.job_id,
           'reason', CASE WHEN gji.ratio_finalization_lease_expires_at IS NULL
                          THEN 'missing_lease' ELSE 'expired_lease' END,
           'lease_expires_at', gji.ratio_finalization_lease_expires_at
         )
    FROM public.generation_job_items gji
    JOIN public.generation_jobs j ON j.id = gji.job_id
   WHERE gji.ratio_enforcement_status = 'processing'
     AND (
       gji.ratio_finalization_lease_expires_at IS NULL
       OR gji.ratio_finalization_lease_expires_at < now()
     )
     AND (
       gji.created_at > now() - interval '30 days'
       OR gji.updated_at > now() - interval '30 days'
       OR j.status NOT IN ('completed','failed','cancelled')
       OR EXISTS (
            SELECT 1 FROM public.collections c
             WHERE c.id = j.matching_collection_id
               AND c.status = 'active'
          )
     )
   ORDER BY gji.updated_at DESC
   LIMIT v_limit;

  RETURN QUERY
  SELECT 'completed_item_missing_canonical_asset'::text,
         gji.id,
         coalesce(gji.ratio_finalization_completed_at, gji.completed_at, gji.updated_at),
         jsonb_build_object(
           'item_id', gji.id,
           'gallery_image_id', gji.gallery_image_id,
           'missing_fields', (
             SELECT coalesce(jsonb_agg(f), '[]'::jsonb) FROM (
               SELECT 'gallery_image_id'::text AS f WHERE gji.gallery_image_id IS NULL
               UNION ALL SELECT 'generated_images_row' WHERE gji.gallery_image_id IS NOT NULL AND gi.id IS NULL
               UNION ALL SELECT 'canonical_storage_path'
                 WHERE gi.id IS NOT NULL
                   AND coalesce(nullif(gi.master_storage_path,''), nullif(gi.storage_path,'')) IS NULL
               UNION ALL SELECT 'canonical_width'
                 WHERE gi.id IS NOT NULL
                   AND coalesce(gi.master_width, gi.actual_width_px, 0) <= 0
               UNION ALL SELECT 'canonical_height'
                 WHERE gi.id IS NOT NULL
                   AND coalesce(gi.master_height, gi.actual_height_px, 0) <= 0
             ) missing
           )
         )
    FROM public.generation_job_items gji
    JOIN public.generation_jobs j ON j.id = gji.job_id
    LEFT JOIN public.generated_images gi ON gi.id = gji.gallery_image_id
   WHERE gji.ratio_enforcement_status = 'completed'
     AND (
       gji.created_at > now() - interval '30 days'
       OR gji.updated_at > now() - interval '30 days'
       OR j.status NOT IN ('completed','failed','cancelled')
       OR EXISTS (
            SELECT 1 FROM public.collections c
             WHERE c.id = j.matching_collection_id
               AND c.status = 'active'
          )
     )
     AND (
       gji.gallery_image_id IS NULL
       OR gi.id IS NULL
       OR coalesce(nullif(gi.master_storage_path,''), nullif(gi.storage_path,'')) IS NULL
       OR coalesce(gi.master_width, gi.actual_width_px, 0) <= 0
       OR coalesce(gi.master_height, gi.actual_height_px, 0) <= 0
     )
   ORDER BY coalesce(gji.ratio_finalization_completed_at, gji.completed_at, gji.updated_at) DESC
   LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_current_generation_safety_state(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.report_current_generation_safety_state(integer) TO authenticated;