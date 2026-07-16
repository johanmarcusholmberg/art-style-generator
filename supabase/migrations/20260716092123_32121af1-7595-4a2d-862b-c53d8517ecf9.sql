
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public._archive_generation_jobs (LIKE public.generation_jobs INCLUDING ALL);
INSERT INTO public._archive_generation_jobs SELECT * FROM public.generation_jobs;

CREATE TABLE IF NOT EXISTS public._archive_generation_job_items (LIKE public.generation_job_items INCLUDING ALL);
INSERT INTO public._archive_generation_job_items SELECT * FROM public.generation_job_items;

DELETE FROM public.generation_job_items;
DELETE FROM public.generation_jobs;

ALTER TABLE public.generation_jobs
  ADD COLUMN profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN style_key text NOT NULL,
  ADD COLUMN generation_mode text NOT NULL DEFAULT 'freestyle',
  ADD COLUMN context_key text,
  ADD COLUMN idempotency_key text NOT NULL;

CREATE UNIQUE INDEX generation_jobs_profile_idempotency_uidx
  ON public.generation_jobs (profile_id, idempotency_key);

CREATE INDEX generation_jobs_active_lookup_idx
  ON public.generation_jobs
    (profile_id, style_key, generation_mode, (coalesce(context_key, '')), job_type, created_at DESC)
  WHERE status IN ('queued','dispatching','processing');

CREATE INDEX generation_jobs_terminal_lookup_idx
  ON public.generation_jobs
    (profile_id, style_key, generation_mode, (coalesce(context_key, '')), created_at DESC)
  WHERE status IN ('completed','failed','cancelled');

ALTER TABLE public.generation_job_items
  ADD COLUMN position int NOT NULL DEFAULT 0,
  ADD COLUMN request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN result_metadata jsonb,
  ADD COLUMN attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN provider_label text,
  ADD COLUMN raw_image_url text,
  ADD COLUMN enforced_image_url text,
  ADD COLUMN ratio_enforcement_status text NOT NULL DEFAULT 'not_required'
    CHECK (ratio_enforcement_status IN ('not_required','pending','completed','failed')),
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN heartbeat_at timestamptz;

CREATE INDEX generation_job_items_recovery_idx
  ON public.generation_job_items (status, lease_expires_at)
  WHERE status IN ('queued','dispatching','processing');

CREATE INDEX generation_job_items_job_position_idx
  ON public.generation_job_items (job_id, position);

GRANT SELECT ON public.generation_jobs TO authenticated;
GRANT SELECT ON public.generation_job_items TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;
GRANT ALL ON public.generation_job_items TO service_role;

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_job_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs' LOOP
    EXECUTE format('DROP POLICY %I ON public.generation_jobs', r.policyname);
  END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='generation_job_items' LOOP
    EXECUTE format('DROP POLICY %I ON public.generation_job_items', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Owners can view their jobs"
  ON public.generation_jobs
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY "Owners can view their job items"
  ON public.generation_job_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.generation_jobs j
    WHERE j.id = generation_job_items.job_id
      AND j.profile_id = public.current_profile_id()
  ));

ALTER TABLE public.generation_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.generation_job_items REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.create_generation_job(
  p_idempotency_key text,
  p_job_type text,
  p_style_key text,
  p_generation_mode text,
  p_context_key text,
  p_prompt text,
  p_aspect_ratio text,
  p_background_style text,
  p_items jsonb
) RETURNS TABLE(job_id uuid, item_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_job_id uuid;
  v_existing_id uuid;
  v_ids uuid[];
  v_count int;
BEGIN
  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'invalid_items'; END IF;

  SELECT id INTO v_existing_id FROM public.generation_jobs
    WHERE profile_id = v_profile_id AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    SELECT array_agg(id ORDER BY position) INTO v_ids
      FROM public.generation_job_items WHERE job_id = v_existing_id;
    job_id := v_existing_id; item_ids := v_ids;
    RETURN NEXT; RETURN;
  END IF;

  v_count := jsonb_array_length(p_items);

  INSERT INTO public.generation_jobs (
    profile_id, style_key, generation_mode, context_key, idempotency_key,
    job_type, prompt, aspect_ratio, background_style, status,
    total_images, batch_size, mode
  ) VALUES (
    v_profile_id, p_style_key, p_generation_mode, p_context_key, p_idempotency_key,
    coalesce(p_job_type,'single'), p_prompt,
    coalesce(p_aspect_ratio,'5:7'), coalesce(p_background_style,'white'),
    'queued', v_count, v_count, p_generation_mode
  ) RETURNING id INTO v_job_id;

  WITH ins AS (
    INSERT INTO public.generation_job_items (
      job_id, prompt_variant, status, position, request_payload, provider_label
    )
    SELECT
      v_job_id, coalesce(item->>'prompt', p_prompt), 'queued',
      (ord - 1)::int, item, item->>'providerLabel'
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord)
    RETURNING id, position
  )
  SELECT array_agg(id ORDER BY position) INTO v_ids FROM ins;

  job_id := v_job_id; item_ids := v_ids;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.create_generation_job(text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_generation_job(text,text,text,text,text,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_generation_item(
  p_item_id uuid, p_lease_seconds int DEFAULT 180
) RETURNS TABLE(id uuid, lease_token uuid, request_payload jsonb, job_id uuid, attempt_count int, provider_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token uuid := gen_random_uuid(); v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH locked AS (
    SELECT gji.id FROM public.generation_job_items gji
    WHERE gji.id = p_item_id
      AND gji.status IN ('queued','dispatching','processing')
      AND (gji.lease_token IS NULL OR gji.lease_expires_at IS NULL OR gji.lease_expires_at < v_now)
    FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.generation_job_items gji
    SET lease_token = v_token,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        heartbeat_at = v_now,
        status = 'dispatching',
        attempt_count = gji.attempt_count + 1,
        started_at = coalesce(gji.started_at, v_now),
        updated_at = v_now
    FROM locked WHERE gji.id = locked.id
    RETURNING gji.id, gji.lease_token, gji.request_payload, gji.job_id, gji.attempt_count, gji.provider_label
  )
  SELECT * FROM upd;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_generation_item(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_generation_item(uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_generation_item(
  p_item_id uuid, p_lease_token uuid, p_lease_seconds int DEFAULT 180
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_updated int;
BEGIN
  UPDATE public.generation_job_items
  SET heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      status = 'processing',
      updated_at = now()
  WHERE id = p_item_id AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_generation_item(uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_generation_item(uuid,uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_generation_item(
  p_item_id uuid, p_lease_token uuid,
  p_raw_image_url text, p_enforced_image_url text, p_ratio_status text,
  p_storage_path text, p_gallery_image_id uuid, p_result_metadata jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_updated int;
BEGIN
  UPDATE public.generation_job_items
  SET status = 'completed',
      raw_image_url = p_raw_image_url,
      enforced_image_url = p_enforced_image_url,
      image_url = coalesce(p_enforced_image_url, p_raw_image_url),
      ratio_enforcement_status = coalesce(p_ratio_status, 'not_required'),
      storage_path = p_storage_path,
      gallery_image_id = p_gallery_image_id,
      result_metadata = p_result_metadata,
      completed_at = now(), heartbeat_at = now(), updated_at = now()
  WHERE id = p_item_id AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_generation_item(uuid,uuid,text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_generation_item(uuid,uuid,text,text,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_generation_item(
  p_item_id uuid, p_lease_token uuid, p_error text, p_terminal boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_updated int;
BEGIN
  UPDATE public.generation_job_items
  SET status = CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
      error_message = p_error,
      lease_token = CASE WHEN p_terminal THEN NULL ELSE lease_token END,
      lease_expires_at = CASE WHEN p_terminal THEN NULL ELSE now() END,
      completed_at = CASE WHEN p_terminal THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_item_id AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.fail_generation_item(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_generation_item(uuid,uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_ratio_enforcement(
  p_item_id uuid, p_enforced_image_url text, p_storage_path text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile uuid; v_owner uuid; v_current text;
BEGIN
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT j.profile_id, gji.ratio_enforcement_status
  INTO v_owner, v_current
  FROM public.generation_job_items gji
  JOIN public.generation_jobs j ON j.id = gji.job_id
  WHERE gji.id = p_item_id;
  IF v_owner IS NULL OR v_owner <> v_profile THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_current = 'completed' THEN RETURN true; END IF;
  UPDATE public.generation_job_items
  SET enforced_image_url = p_enforced_image_url,
      image_url = p_enforced_image_url,
      storage_path = coalesce(p_storage_path, storage_path),
      ratio_enforcement_status = 'completed',
      updated_at = now()
  WHERE id = p_item_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_ratio_enforcement(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_ratio_enforcement(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_recoverable_items(p_max int DEFAULT 20)
RETURNS TABLE(id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT gji.id FROM public.generation_job_items gji
  WHERE gji.status IN ('queued','dispatching','processing')
    AND (gji.lease_expires_at IS NULL OR gji.lease_expires_at < now())
    AND gji.attempt_count < 3
    AND gji.created_at > now() - interval '1 hour'
  ORDER BY gji.created_at ASC
  LIMIT p_max;
$$;
REVOKE ALL ON FUNCTION public.find_recoverable_items(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_recoverable_items(int) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_exhausted_items() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.generation_job_items
    SET status = 'failed',
        error_message = coalesce(error_message,'') || ' [exhausted after retries]',
        completed_at = now(), updated_at = now()
    WHERE status IN ('queued','dispatching','processing')
      AND attempt_count >= 3
      AND (lease_expires_at IS NULL OR lease_expires_at < now())
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_exhausted_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_exhausted_items() TO service_role;

CREATE OR REPLACE FUNCTION public.update_generation_job_aggregate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE v_total int; v_completed int; v_failed int; v_status text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status='completed'), count(*) FILTER (WHERE status='failed')
    INTO v_total, v_completed, v_failed
    FROM public.generation_job_items WHERE job_id = NEW.job_id;
  IF v_completed + v_failed >= v_total THEN
    IF v_completed = 0 THEN v_status := 'failed'; ELSE v_status := 'completed'; END IF;
  ELSIF v_completed + v_failed > 0 THEN v_status := 'processing';
  ELSE v_status := 'queued'; END IF;
  UPDATE public.generation_jobs
  SET completed_images = v_completed, failed_images = v_failed,
      status = v_status, updated_at = now()
  WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_generation_job_aggregate ON public.generation_job_items;
CREATE TRIGGER trg_update_generation_job_aggregate
  AFTER UPDATE OF status ON public.generation_job_items
  FOR EACH ROW WHEN (NEW.status IN ('completed','failed'))
  EXECUTE FUNCTION public.update_generation_job_aggregate();

DROP TRIGGER IF EXISTS trg_touch_generation_jobs ON public.generation_jobs;
CREATE TRIGGER trg_touch_generation_jobs BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_upscale_jobs_updated_at();

DROP TRIGGER IF EXISTS trg_touch_generation_job_items ON public.generation_job_items;
CREATE TRIGGER trg_touch_generation_job_items BEFORE UPDATE ON public.generation_job_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_upscale_jobs_updated_at();
