-- Turn 2a.2 follow-up: harden create_matching_collection_atomic.
--
-- Additive re-declaration of the RPC. Fixes:
--   1. Injects the real collection_id into every item payload's
--      matchingCollectionId, overriding whatever the caller supplied.
--   2. Enforces 1..20 items server-side.
--   3. Rejects reuse of a job idempotency key that is already linked to
--      a DIFFERENT collection (prevents accidental cross-collection linkage).
--   4. Handles orphan fingerprint rows (collection exists, no job yet)
--      by adopting the existing collection and creating a fresh job for it.
--   5. Validates that a non-null anchor_image_id belongs to the caller.
--
-- Single-user tool: legacy null-profile rows remain readable/updatable
-- to the authenticated operator via existing RLS. No claim / ownership
-- transfer / multi-tenant logic is introduced.

CREATE OR REPLACE FUNCTION public.create_matching_collection_atomic(
  p_fingerprint text,
  p_name text,
  p_anchor_image_id uuid,
  p_anchor_image_url text,
  p_anchor_storage_path text,
  p_anchor_width_px integer,
  p_anchor_height_px integer,
  p_anchor_aspect_ratio text,
  p_anchor_style_key text,
  p_anchor_poster_format_id text,
  p_anchor_background_style text,
  p_anchor_provider text,
  p_anchor_model text,
  p_resolved_provider text,
  p_resolved_model text,
  p_provider_preference text,
  p_provider_substitution_reason text,
  p_art_direction jsonb,
  p_art_direction_version integer,
  p_consistency_strength text,
  p_reference_strength text,
  p_job_idempotency_key text,
  p_job_prompt text,
  p_items jsonb
)
RETURNS TABLE(collection_id uuid, job_id uuid, item_ids uuid[], reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_existing_collection uuid;
  v_existing_job uuid;
  v_ids uuid[];
  v_collection_id uuid;
  v_job_row record;
  v_item_count int;
  v_anchor_owner uuid;
  v_existing_idem_job uuid;
  v_existing_idem_collection uuid;
  v_normalized_items jsonb;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_fingerprint IS NULL OR length(p_fingerprint) < 8 THEN
    RAISE EXCEPTION 'invalid_fingerprint';
  END IF;
  IF p_job_idempotency_key IS NULL OR length(p_job_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  v_item_count := jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 20 THEN
    RAISE EXCEPTION 'invalid_item_count: expected 1..20, got %', v_item_count;
  END IF;

  -- (7) Anchor ownership check. Legacy null-profile generated_images rows
  --     remain accessible to the operator to mirror existing RLS.
  IF p_anchor_image_id IS NOT NULL THEN
    SELECT gi.user_id INTO v_anchor_owner
      FROM public.generated_images gi
     WHERE gi.id = p_anchor_image_id;
    IF v_anchor_owner IS NULL THEN
      -- either row missing or legacy null-owned; accept legacy only.
      IF NOT EXISTS (SELECT 1 FROM public.generated_images WHERE id = p_anchor_image_id) THEN
        RAISE EXCEPTION 'anchor_image_not_found';
      END IF;
    ELSIF v_anchor_owner <> v_profile_id THEN
      RAISE EXCEPTION 'anchor_image_forbidden';
    END IF;
  END IF;

  -- Idempotent replay on same fingerprint (fully created row).
  SELECT c.id, c.matching_collection_job_id
    INTO v_existing_collection, v_existing_job
    FROM public.collections c
   WHERE c.profile_id = v_profile_id
     AND c.fingerprint = p_fingerprint
   LIMIT 1;

  IF v_existing_collection IS NOT NULL AND v_existing_job IS NOT NULL THEN
    SELECT array_agg(gi.id ORDER BY gi.position)
      INTO v_ids
      FROM public.generation_job_items gi
     WHERE gi.job_id = v_existing_job;
    collection_id := v_existing_collection;
    job_id := v_existing_job;
    item_ids := coalesce(v_ids, ARRAY[]::uuid[]);
    reused := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- (5) Reject cross-collection idempotency-key reuse.
  SELECT j.id, j.matching_collection_id
    INTO v_existing_idem_job, v_existing_idem_collection
    FROM public.generation_jobs j
   WHERE j.profile_id = v_profile_id
     AND j.idempotency_key = p_job_idempotency_key
   LIMIT 1;

  IF v_existing_idem_job IS NOT NULL
     AND v_existing_idem_collection IS NOT NULL
     AND (v_existing_collection IS NULL OR v_existing_idem_collection <> v_existing_collection)
  THEN
    RAISE EXCEPTION 'idempotency_key_collides_with_other_collection';
  END IF;

  -- (6) Orphan fingerprint: collection row exists but no job attached
  --     yet (a previous call died between insert and job creation).
  --     Adopt it instead of trying to insert a duplicate.
  IF v_existing_collection IS NOT NULL AND v_existing_job IS NULL THEN
    v_collection_id := v_existing_collection;
    UPDATE public.collections
       SET name = coalesce(p_name, name),
           anchor_image_id = coalesce(p_anchor_image_id, anchor_image_id),
           anchor_image_url = coalesce(p_anchor_image_url, anchor_image_url),
           anchor_storage_path = coalesce(p_anchor_storage_path, anchor_storage_path),
           anchor_width_px = coalesce(p_anchor_width_px, anchor_width_px),
           anchor_height_px = coalesce(p_anchor_height_px, anchor_height_px),
           anchor_aspect_ratio = coalesce(p_anchor_aspect_ratio, anchor_aspect_ratio),
           anchor_style_key = coalesce(p_anchor_style_key, anchor_style_key),
           anchor_poster_format_id = coalesce(p_anchor_poster_format_id, anchor_poster_format_id),
           anchor_background_style = coalesce(p_anchor_background_style, anchor_background_style),
           anchor_provider = coalesce(p_anchor_provider, anchor_provider),
           anchor_model = coalesce(p_anchor_model, anchor_model),
           resolved_provider = coalesce(p_resolved_provider, resolved_provider),
           resolved_model = coalesce(p_resolved_model, resolved_model),
           provider_preference = coalesce(p_provider_preference, provider_preference),
           provider_substitution_reason = coalesce(p_provider_substitution_reason, provider_substitution_reason),
           art_direction = coalesce(p_art_direction, art_direction),
           art_direction_version = coalesce(p_art_direction_version, art_direction_version),
           consistency_strength = coalesce(p_consistency_strength, consistency_strength),
           reference_strength = coalesce(p_reference_strength, reference_strength),
           updated_at = now()
     WHERE id = v_collection_id;
  ELSE
    INSERT INTO public.collections (
      profile_id, name, fingerprint, status,
      anchor_image_id, anchor_image_url, anchor_storage_path,
      anchor_width_px, anchor_height_px, anchor_aspect_ratio,
      anchor_style_key, anchor_poster_format_id, anchor_background_style,
      anchor_provider, anchor_model,
      resolved_provider, resolved_model,
      provider_preference, provider_substitution_reason,
      art_direction, art_direction_version,
      consistency_strength, reference_strength
    ) VALUES (
      v_profile_id, p_name, p_fingerprint, 'active',
      p_anchor_image_id, p_anchor_image_url, p_anchor_storage_path,
      p_anchor_width_px, p_anchor_height_px, p_anchor_aspect_ratio,
      p_anchor_style_key, p_anchor_poster_format_id, p_anchor_background_style,
      p_anchor_provider, p_anchor_model,
      p_resolved_provider, p_resolved_model,
      p_provider_preference, p_provider_substitution_reason,
      p_art_direction, p_art_direction_version,
      p_consistency_strength, p_reference_strength
    )
    RETURNING id INTO v_collection_id;
  END IF;

  -- (1) + (3) Normalize items: strip any caller-provided matchingCollectionId
  --           and inject the authoritative collection id.
  SELECT jsonb_agg(
           (item - 'matchingCollectionId')
             || jsonb_build_object('matchingCollectionId', v_collection_id::text)
           ORDER BY ord
         )
    INTO v_normalized_items
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);

  SELECT * INTO v_job_row FROM public.create_generation_job(
    p_idempotency_key   := p_job_idempotency_key,
    p_job_type          := 'matching_collection',
    p_style_key         := p_anchor_style_key,
    p_generation_mode   := 'standard',
    p_context_key       := v_collection_id::text,
    p_prompt            := p_job_prompt,
    p_aspect_ratio      := coalesce(p_anchor_aspect_ratio, '5:7'),
    p_background_style  := coalesce(p_anchor_background_style, 'white'),
    p_items             := v_normalized_items
  );

  UPDATE public.collections
     SET matching_collection_job_id = v_job_row.job_id,
         updated_at = now()
   WHERE id = v_collection_id;

  UPDATE public.generation_jobs
     SET matching_collection_id = v_collection_id,
         anchor_image_id = p_anchor_image_id,
         anchor_image_url = p_anchor_image_url,
         anchor_width_px = p_anchor_width_px,
         anchor_height_px = p_anchor_height_px,
         anchor_aspect_ratio = p_anchor_aspect_ratio,
         art_direction = p_art_direction,
         art_direction_version = p_art_direction_version,
         consistency_strength = p_consistency_strength,
         updated_at = now()
   WHERE id = v_job_row.job_id;

  collection_id := v_collection_id;
  job_id := v_job_row.job_id;
  item_ids := v_job_row.item_ids;
  reused := false;
  RETURN NEXT;
END;
$function$;