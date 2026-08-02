CREATE OR REPLACE FUNCTION public.execute_asset_mutation(
  p_root_image_id uuid,
  p_mode text,
  p_asset_id uuid DEFAULT NULL,
  p_membership_id uuid DEFAULT NULL,
  p_promote_asset_id uuid DEFAULT NULL,
  p_expected_canonical_asset_id uuid DEFAULT NULL,
  p_expected_live_asset_ids uuid[] DEFAULT NULL,
  p_confirmed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_root record;
  v_live uuid[];
  v_promote record;
  v_target record;
  v_paths text[] := ARRAY[]::text[];
  v_candidate text;
  v_removed uuid[] := ARRAY[]::uuid[];
  v_noop boolean := false;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_mode NOT IN (
    'remove_membership','archive_root','archive_asset',
    'delete_asset','delete_root_cascade'
  ) THEN
    RAISE EXCEPTION 'invalid_mode: %', p_mode;
  END IF;

  ---------------------------------------------------------------- membership
  IF p_mode = 'remove_membership' THEN
    IF p_membership_id IS NULL THEN RAISE EXCEPTION 'membership_id_required'; END IF;
    DELETE FROM public.collection_images WHERE id = p_membership_id;
    RETURN jsonb_build_object(
      'ok', true, 'mode', p_mode, 'noop', NOT FOUND,
      'storage_paths_safe_to_remove', ARRAY[]::text[]
    );
  END IF;

  IF p_root_image_id IS NULL THEN RAISE EXCEPTION 'root_image_id_required'; END IF;

  SELECT * INTO v_root FROM public.generated_images
   WHERE id = p_root_image_id FOR UPDATE;
  IF v_root.id IS NULL THEN RAISE EXCEPTION 'root_not_found'; END IF;

  ------------------------------------------------- optimistic concurrency
  SELECT coalesce(array_agg(a.id ORDER BY a.id), ARRAY[]::uuid[])
    INTO v_live
    FROM public.generated_image_assets a
   WHERE a.generated_image_id = p_root_image_id
     AND a.deleted_at IS NULL;

  IF p_expected_live_asset_ids IS NOT NULL THEN
    IF (SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::uuid[])
          FROM unnest(p_expected_live_asset_ids) x) IS DISTINCT FROM v_live THEN
      -- tolerate the idempotent replay case: the plan already ran
      IF NOT (p_mode IN ('delete_asset','archive_asset')
              AND p_asset_id IS NOT NULL
              AND NOT (p_asset_id = ANY(v_live))) THEN
        RAISE EXCEPTION 'stale_preflight_assets';
      END IF;
      v_noop := true;
    END IF;
  END IF;

  IF p_expected_canonical_asset_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.generated_image_assets a
       WHERE a.id = p_expected_canonical_asset_id
         AND a.generated_image_id = p_root_image_id
    ) THEN
      RAISE EXCEPTION 'stale_preflight_canonical';
    END IF;
  END IF;

  ------------------------------------------------------- canonical promotion
  IF p_promote_asset_id IS NOT NULL THEN
    SELECT * INTO v_promote FROM public.generated_image_assets
     WHERE id = p_promote_asset_id
       AND generated_image_id = p_root_image_id
       AND deleted_at IS NULL
     FOR UPDATE;
    IF v_promote.id IS NULL THEN RAISE EXCEPTION 'replacement_not_available'; END IF;
    IF coalesce(v_promote.width_px,0) <= 0 OR coalesce(v_promote.height_px,0) <= 0 THEN
      RAISE EXCEPTION 'replacement_dimensions_invalid';
    END IF;

    UPDATE public.generated_images
       SET master_storage_path = v_promote.storage_path,
           storage_path        = v_promote.storage_path,
           master_width        = v_promote.width_px,
           master_height       = v_promote.height_px,
           actual_width_px     = v_promote.width_px,
           actual_height_px    = v_promote.height_px
     WHERE id = p_root_image_id;
  END IF;

  --------------------------------------------------------------- archive root
  IF p_mode = 'archive_root' THEN
    UPDATE public.generated_images
       SET admin_status = 'archived', is_archived = true
     WHERE id = p_root_image_id;
    RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'noop', false,
      'promoted_asset_id', p_promote_asset_id,
      'storage_paths_safe_to_remove', ARRAY[]::text[]);
  END IF;

  -------------------------------------------------------------- archive asset
  IF p_mode = 'archive_asset' THEN
    IF p_asset_id IS NULL THEN RAISE EXCEPTION 'asset_id_required'; END IF;
    UPDATE public.generated_image_assets
       SET updated_at = now()
     WHERE id = p_asset_id AND generated_image_id = p_root_image_id;
    RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'noop', v_noop,
      'promoted_asset_id', p_promote_asset_id,
      'storage_paths_safe_to_remove', ARRAY[]::text[]);
  END IF;

  --------------------------------------------------------------- delete asset
  IF p_mode = 'delete_asset' THEN
    IF p_asset_id IS NULL THEN RAISE EXCEPTION 'asset_id_required'; END IF;
    SELECT * INTO v_target FROM public.generated_image_assets
     WHERE id = p_asset_id AND generated_image_id = p_root_image_id FOR UPDATE;
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;

    IF v_target.deleted_at IS NOT NULL THEN
      v_noop := true;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.generated_image_assets c
         WHERE c.source_asset_id = p_asset_id AND c.deleted_at IS NULL
      ) THEN RAISE EXCEPTION 'asset_has_live_dependants'; END IF;

      UPDATE public.generated_image_assets
         SET deleted_at = now(), updated_at = now()
       WHERE id = p_asset_id;
      v_removed := ARRAY[p_asset_id];
    END IF;

    v_candidate := v_target.storage_path;
    IF v_candidate IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.generated_image_assets a
          WHERE a.deleted_at IS NULL AND a.storage_path = v_candidate)
       AND NOT EXISTS (
         SELECT 1 FROM public.generated_images g
          WHERE g.deleted_at IS NULL
            AND v_candidate IN (g.storage_path, g.master_storage_path,
                                g.enhanced_storage_path, g.original_storage_path))
    THEN
      v_paths := ARRAY[v_candidate];
    END IF;

    RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'noop', v_noop,
      'promoted_asset_id', p_promote_asset_id,
      'deleted_asset_ids', to_jsonb(v_removed),
      'storage_paths_safe_to_remove', to_jsonb(v_paths));
  END IF;

  ------------------------------------------------------- root cascade delete
  IF NOT p_confirmed THEN RAISE EXCEPTION 'confirmation_required'; END IF;

  IF v_root.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'noop', true,
      'storage_paths_safe_to_remove', ARRAY[]::text[]);
  END IF;

  DELETE FROM public.collection_images WHERE image_id = p_root_image_id;

  UPDATE public.generated_image_assets
     SET deleted_at = now(), updated_at = now()
   WHERE generated_image_id = p_root_image_id AND deleted_at IS NULL;

  UPDATE public.generated_images
     SET deleted_at = now()
   WHERE id = p_root_image_id;

  -- Collect every candidate object for this root, then keep only the ones
  -- no surviving live row still references.
  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::text[]) INTO v_paths
    FROM (
      SELECT unnest(ARRAY[v_root.storage_path, v_root.master_storage_path,
                          v_root.enhanced_storage_path, v_root.original_storage_path]) AS c
      UNION ALL
      SELECT a.storage_path FROM public.generated_image_assets a
       WHERE a.generated_image_id = p_root_image_id
    ) s
   WHERE c IS NOT NULL AND c <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.generated_image_assets a2
        WHERE a2.deleted_at IS NULL AND a2.storage_path = c)
     AND NOT EXISTS (
       SELECT 1 FROM public.generated_images g2
        WHERE g2.deleted_at IS NULL
          AND c IN (g2.storage_path, g2.master_storage_path,
                    g2.enhanced_storage_path, g2.original_storage_path));

  RETURN jsonb_build_object('ok', true, 'mode', p_mode, 'noop', false,
    'storage_paths_safe_to_remove', to_jsonb(v_paths));
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_asset_mutation(uuid, text, uuid, uuid, uuid, uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_asset_mutation(uuid, text, uuid, uuid, uuid, uuid, uuid[], boolean) TO authenticated;