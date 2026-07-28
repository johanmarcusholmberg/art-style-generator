-- 1. Precondition: no ownerless collections
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.collections WHERE profile_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden collections ownership while profile_id IS NULL rows remain';
  END IF;
END;
$$;

-- 2. Require an owner
ALTER TABLE public.collections ALTER COLUMN profile_id SET NOT NULL;

-- 3. Collections RLS: single authenticated admin
DROP POLICY IF EXISTS "Owners can insert their collections" ON public.collections;
DROP POLICY IF EXISTS "Owners or legacy rows can delete collections" ON public.collections;
DROP POLICY IF EXISTS "Owners or legacy rows can update collections" ON public.collections;
DROP POLICY IF EXISTS "Owners or legacy rows can view collections" ON public.collections;

CREATE POLICY "Admin can view all collections" ON public.collections
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin can insert owned collections" ON public.collections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_admin() AND profile_id = public.current_profile_id());
CREATE POLICY "Admin can update collections" ON public.collections
  FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin() AND profile_id IS NOT NULL);
CREATE POLICY "Admin can delete collections" ON public.collections
  FOR DELETE TO authenticated USING (public.is_current_user_admin());

REVOKE ALL ON public.collections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

-- 4. Related tables: block anonymous writes, keep full operator access
DROP POLICY IF EXISTS "Anyone can insert collection_images" ON public.collection_images;
DROP POLICY IF EXISTS "Anyone can delete collection_images" ON public.collection_images;
DROP POLICY IF EXISTS "Anyone can view collection_images" ON public.collection_images;
CREATE POLICY "Operator can view collection_images" ON public.collection_images
  FOR SELECT TO authenticated USING (public.is_current_user_active());
CREATE POLICY "Operator can insert collection_images" ON public.collection_images
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_active());
CREATE POLICY "Operator can delete collection_images" ON public.collection_images
  FOR DELETE TO authenticated USING (public.is_current_user_active());
REVOKE ALL ON public.collection_images FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_images TO authenticated;
GRANT ALL ON public.collection_images TO service_role;

DROP POLICY IF EXISTS "Anyone can insert images" ON public.generated_images;
DROP POLICY IF EXISTS "Anyone can delete images" ON public.generated_images;
DROP POLICY IF EXISTS "Anyone can view images" ON public.generated_images;
DROP POLICY IF EXISTS "Anyone can update images" ON public.generated_images;
CREATE POLICY "Operator can view images" ON public.generated_images
  FOR SELECT TO authenticated USING (public.is_current_user_active());
CREATE POLICY "Operator can insert images" ON public.generated_images
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_active());
CREATE POLICY "Operator can update images" ON public.generated_images
  FOR UPDATE TO authenticated USING (public.is_current_user_active()) WITH CHECK (public.is_current_user_active());
CREATE POLICY "Operator can delete images" ON public.generated_images
  FOR DELETE TO authenticated USING (public.is_current_user_active());
REVOKE ALL ON public.generated_images FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_images TO authenticated;
GRANT ALL ON public.generated_images TO service_role;

DROP POLICY IF EXISTS "Anyone can insert image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Anyone can delete image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Anyone can view image assets" ON public.generated_image_assets;
DROP POLICY IF EXISTS "Anyone can update image assets" ON public.generated_image_assets;
CREATE POLICY "Operator can view image assets" ON public.generated_image_assets
  FOR SELECT TO authenticated USING (public.is_current_user_active());
CREATE POLICY "Operator can insert image assets" ON public.generated_image_assets
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_active());
CREATE POLICY "Operator can update image assets" ON public.generated_image_assets
  FOR UPDATE TO authenticated USING (public.is_current_user_active()) WITH CHECK (public.is_current_user_active());
CREATE POLICY "Operator can delete image assets" ON public.generated_image_assets
  FOR DELETE TO authenticated USING (public.is_current_user_active());
REVOKE ALL ON public.generated_image_assets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_image_assets TO authenticated;
GRANT ALL ON public.generated_image_assets TO service_role;

-- Admin-wide visibility on generation records
CREATE POLICY "Admin can view all jobs" ON public.generation_jobs
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin can view all job items" ON public.generation_job_items
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

-- 5. Function execution grants
REVOKE ALL ON FUNCTION public.create_matching_collection_atomic(text,text,uuid,text,text,integer,integer,text,text,text,text,text,text,text,text,text,text,jsonb,integer,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_matching_collection_atomic(text,text,uuid,text,text,integer,integer,text,text,text,text,text,text,text,text,text,text,jsonb,integer,text,text,text,text,jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_matching_collection_regeneration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_matching_collection_regeneration(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_generation_ratio_finalization(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_generation_ratio_finalization(uuid,integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_generation_ratio_finalization(uuid,uuid,text,text,integer,integer,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_generation_ratio_finalization(uuid,uuid,text,text,integer,integer,text,jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fail_generation_ratio_finalization(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_generation_ratio_finalization(uuid,uuid,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.retry_generation_ratio_finalization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_generation_ratio_finalization(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.report_current_generation_safety_state(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_current_generation_safety_state(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

-- 7. Storage hardening: public read stays, writes require authentication
DROP POLICY IF EXISTS "Public upload access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload print exports" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete print exports" ON storage.objects;

CREATE POLICY "Authenticated can upload generated images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'generated-images');
CREATE POLICY "Authenticated can update generated images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-images') WITH CHECK (bucket_id = 'generated-images');
CREATE POLICY "Authenticated can delete generated images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'generated-images');

CREATE POLICY "Authenticated can upload print exports" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'print-exports');
CREATE POLICY "Authenticated can update print exports" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'print-exports') WITH CHECK (bucket_id = 'print-exports');
CREATE POLICY "Authenticated can delete print exports" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'print-exports');