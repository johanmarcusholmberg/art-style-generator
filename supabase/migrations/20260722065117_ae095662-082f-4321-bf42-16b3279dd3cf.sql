
-- =========================================================================
-- Turn 2a.1 — Matching Collection foundations (additive only)
-- =========================================================================

-- ---- 1. Collections: frozen anchor + ownership + fingerprint --------------
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anchor_image_url text NULL,
  ADD COLUMN IF NOT EXISTS anchor_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS anchor_width_px integer NULL,
  ADD COLUMN IF NOT EXISTS anchor_height_px integer NULL,
  ADD COLUMN IF NOT EXISTS anchor_aspect_ratio text NULL,
  ADD COLUMN IF NOT EXISTS anchor_background_style text NULL,
  ADD COLUMN IF NOT EXISTS provider_preference text NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS fingerprint text NULL;

-- Non-blocking status check (allows existing rows through)
ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_status_check;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_status_check
  CHECK (status IN ('draft','active','failed')) NOT VALID;

-- Per-owner fingerprint uniqueness (scoped so unrelated owners cannot clash).
CREATE UNIQUE INDEX IF NOT EXISTS collections_owner_fingerprint_uidx
  ON public.collections(profile_id, fingerprint)
  WHERE profile_id IS NOT NULL AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS collections_profile_idx
  ON public.collections(profile_id)
  WHERE profile_id IS NOT NULL;

-- ---- 2. Collections RLS: tighten to owner, keep legacy rows visible -------
DROP POLICY IF EXISTS "Anyone can view collections"   ON public.collections;
DROP POLICY IF EXISTS "Anyone can update collections" ON public.collections;
DROP POLICY IF EXISTS "Anyone can delete collections" ON public.collections;
DROP POLICY IF EXISTS "Anyone can insert collections" ON public.collections;

CREATE POLICY "Owners or legacy rows can view collections"
  ON public.collections FOR SELECT
  USING (profile_id IS NULL OR profile_id = public.current_profile_id());

CREATE POLICY "Owners or legacy rows can update collections"
  ON public.collections FOR UPDATE
  USING (profile_id IS NULL OR profile_id = public.current_profile_id())
  WITH CHECK (profile_id IS NULL OR profile_id = public.current_profile_id());

CREATE POLICY "Owners or legacy rows can delete collections"
  ON public.collections FOR DELETE
  USING (profile_id IS NULL OR profile_id = public.current_profile_id());

CREATE POLICY "Owners can insert their collections"
  ON public.collections FOR INSERT
  WITH CHECK (profile_id IS NULL OR profile_id = public.current_profile_id());

-- ---- 3. Generation job items: regeneration lineage -----------------------
ALTER TABLE public.generation_job_items
  ADD COLUMN IF NOT EXISTS regenerated_from_item_id uuid NULL
    REFERENCES public.generation_job_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generation_job_items_regen_source_idx
  ON public.generation_job_items(regenerated_from_item_id)
  WHERE regenerated_from_item_id IS NOT NULL;

-- ---- 4. Ratio finalization state vocabulary (non-blocking check) ---------
ALTER TABLE public.generation_job_items
  DROP CONSTRAINT IF EXISTS generation_job_items_ratio_status_check;
ALTER TABLE public.generation_job_items
  ADD CONSTRAINT generation_job_items_ratio_status_check
  CHECK (
    ratio_enforcement_status IS NULL
    OR ratio_enforcement_status IN ('not_required','pending','processing','completed','failed')
  ) NOT VALID;

COMMENT ON COLUMN public.generation_job_items.ratio_enforcement_status IS
  'Durable ratio-finalization state machine: not_required | pending | processing | completed | failed. NULL only for legacy rows.';

-- ---- 5. Atomic RPC: create_matching_collection_atomic --------------------
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
AS $$
DECLARE
  v_profile_id uuid;
  v_existing_collection uuid;
  v_existing_job uuid;
  v_ids uuid[];
  v_collection_id uuid;
  v_job_row record;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_fingerprint IS NULL OR length(p_fingerprint) < 8 THEN
    RAISE EXCEPTION 'invalid_fingerprint';
  END IF;
  IF p_job_idempotency_key IS NULL OR length(p_job_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  -- Idempotent replay: same owner + same fingerprint => return existing.
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

  -- Fresh creation — everything below is in the caller's transaction, so any
  -- failure (including inside create_generation_job) rolls back the row we
  -- are about to insert. No orphan empty collection can remain.
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

  SELECT * INTO v_job_row FROM public.create_generation_job(
    p_idempotency_key   := p_job_idempotency_key,
    p_job_type          := 'matching_collection',
    p_style_key         := p_anchor_style_key,
    p_generation_mode   := 'standard',
    p_context_key       := v_collection_id::text,
    p_prompt            := p_job_prompt,
    p_aspect_ratio      := coalesce(p_anchor_aspect_ratio, '5:7'),
    p_background_style  := coalesce(p_anchor_background_style, 'white'),
    p_items             := p_items
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
$$;

GRANT EXECUTE ON FUNCTION public.create_matching_collection_atomic(
  text, text, uuid, text, text, integer, integer, text, text, text, text,
  text, text, text, text, text, text, jsonb, integer, text, text, text, text, jsonb
) TO authenticated;
